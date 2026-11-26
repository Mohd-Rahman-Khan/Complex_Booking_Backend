const mongoose = require("mongoose");

const User = require("../models/User");
const Coach = require("../models/Coach");
const Complex = require("../models/Complex");
const Booking = require("../models/Booking");

const { getAvailableCoach } = require("../services/coachBookingService");

// ==========================================
// HELPERS
// ==========================================

const isValidId = (id) =>
  typeof id === "string" && mongoose.Types.ObjectId.isValid(id);

const getAdmin = async (req) => {
  if (!req.user?.userId) return null;

  return User.findOne({
    _id: req.user.userId,
    role: "complex_admin",
    isActive: true,
  });
};

const formatCoach = (coach, complexes = []) => {
  const assignedSports = [];

  complexes.forEach((complex) => {
    (complex.sports || []).forEach((sport) => {
      const assigned = (sport.coachIds || []).some(
        (id) => String(id) === String(coach._id),
      );

      if (assigned) {
        assignedSports.push({
          complexId: complex._id,
          complexName: complex.name,
          sportId: sport._id,
          sportName: sport.name,
          icon: sport.icon,
        });
      }
    });
  });

  return {
    _id: coach._id,
    userId: coach.userId?._id || coach.userId,

    name: coach.userId?.name || "",
    phone: coach.userId?.phone || "",
    email: coach.userId?.email || "",

    profileImage: coach.profileImage,
    experience: coach.experience,
    specialization: coach.specialization,
    qualification: coach.qualification,
    description: coach.description,
    hourlyFee: coach.hourlyFee,

    workingDays: coach.workingDays,
    openingTime: coach.openingTime,
    closingTime: coach.closingTime,
    unavailableRanges: coach.unavailableRanges,

    isActive: coach.isActive,
    assignedSports,

    createdAt: coach.createdAt,
    updatedAt: coach.updatedAt,
  };
};

// ==========================================
// CREATE COACH
// POST /api/coaches
// ==========================================

exports.createCoach = async (req, res) => {
  let createdUser = null;
  let createdCoach = null;

  try {
    const admin = await getAdmin(req);

    if (!admin) {
      return res.status(403).json({
        success: false,
        message: "Complex admin access required",
      });
    }

    const {
      name,
      phone,
      email,
      profileImage = "",
      experience = 0,
      specialization = "",
      qualification = "",
      description = "",
      hourlyFee,
      workingDays = [0, 1, 2, 3, 4, 5, 6],
      openingTime = "06:00",
      closingTime = "22:00",
    } = req.body;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof phone !== "string" ||
      !/^[0-9]{10}$/.test(phone.trim())
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid name and mobile number required",
      });
    }

    if (
      typeof hourlyFee !== "number" ||
      !Number.isFinite(hourlyFee) ||
      hourlyFee < 0 ||
      typeof experience !== "number" ||
      !Number.isFinite(experience) ||
      experience < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid coaching fee or experience",
      });
    }

    if (
      email != null &&
      (typeof email !== "string" ||
        (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())))
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address",
      });
    }

    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

    if (
      !timeRegex.test(openingTime) ||
      !timeRegex.test(closingTime) ||
      openingTime >= closingTime
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid coach working hours",
      });
    }

    const normalizedPhone = phone.trim();

    const normalizedEmail = email?.trim().toLowerCase() || undefined;

    const conditions = [{ phone: normalizedPhone }];

    if (normalizedEmail) {
      conditions.push({
        email: normalizedEmail,
      });
    }

    const existingUser = await User.findOne({
      $or: conditions,
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Mobile number or email already registered",
      });
    }

    // Create OTP login account

    createdUser = await User.create({
      name: name.trim(),
      phone: normalizedPhone,
      email: normalizedEmail,
      role: "coach",
      createdBy: admin._id,
      complexId: null,
      isActive: true,
      isPhoneVerified: false,
    });

    // Create professional coach profile

    createdCoach = await Coach.create({
      userId: createdUser._id,
      createdBy: admin._id,
      profileImage,
      experience,
      specialization,
      qualification,
      description,
      hourlyFee,
      workingDays,
      openingTime,
      closingTime,
      isActive: true,
    });

    const coach = await Coach.findById(createdCoach._id)
      .populate("userId", "name phone email")
      .lean();

    return res.status(201).json({
      success: true,
      message: "Coach created successfully",
      data: {
        coach: formatCoach(coach),
      },
    });
  } catch (error) {
    console.error("Create Coach Error:", error);

    if (createdCoach) {
      await Coach.deleteOne({
        _id: createdCoach._id,
      }).catch(console.error);
    }

    if (createdUser) {
      await User.deleteOne({
        _id: createdUser._id,
      }).catch(console.error);
    }

    return res.status(error.code === 11000 ? 409 : 400).json({
      success: false,
      message:
        error.code === 11000
          ? "Coach account already exists"
          : "Unable to create coach",
    });
  }
};

// ==========================================
// GET ADMIN'S COACHES
// GET /api/coaches/my
// ==========================================

exports.getMyCoaches = async (req, res) => {
  try {
    const admin = await getAdmin(req);

    if (!admin) {
      return res.status(403).json({
        success: false,
        message: "Complex admin access required",
      });
    }

    const [coaches, complexes] = await Promise.all([
      Coach.find({
        createdBy: admin._id,
      })
        .populate("userId", "name phone email")
        .sort({ createdAt: -1 })
        .lean(),

      Complex.find({
        adminId: admin._id,
      })
        .select("name sports")
        .lean(),
    ]);

    const formattedCoaches = coaches.map((coach) =>
      formatCoach(coach, complexes),
    );

    return res.status(200).json({
      success: true,
      count: formattedCoaches.length,

      data: {
        coaches: formattedCoaches,

        totalCoaches: coaches.length,

        activeCoaches: coaches.filter((coach) => coach.isActive).length,

        inactiveCoaches: coaches.filter((coach) => !coach.isActive).length,
      },
    });
  } catch (error) {
    console.error("Get Coaches Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch coaches",
    });
  }
};

// ==========================================
// GET COACH DETAILS
// GET /api/coaches/:coachId
// ==========================================

exports.getCoachById = async (req, res) => {
  try {
    const admin = await getAdmin(req);

    if (!admin) {
      return res.status(403).json({
        success: false,
        message: "Complex admin access required",
      });
    }

    const { coachId } = req.params;

    if (!isValidId(coachId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid coach ID",
      });
    }

    const coach = await Coach.findOne({
      _id: coachId,
      createdBy: admin._id,
    })
      .populate("userId", "name phone email")
      .lean();

    if (!coach) {
      return res.status(404).json({
        success: false,
        message: "Coach not found",
      });
    }

    const complexes = await Complex.find({
      adminId: admin._id,
    })
      .select("name sports")
      .lean();

    return res.status(200).json({
      success: true,

      data: {
        coach: formatCoach(coach, complexes),
      },
    });
  } catch (error) {
    console.error("Get Coach Details Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch coach details",
    });
  }
};

// ==========================================
// UPDATE COACH
// PUT /api/coaches/:coachId
// ==========================================

exports.updateCoach = async (req, res) => {
  try {
    const admin = await getAdmin(req);

    if (!admin) {
      return res.status(403).json({
        success: false,
        message: "Complex admin access required",
      });
    }

    const { coachId } = req.params;

    if (!isValidId(coachId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid coach ID",
      });
    }

    const coach = await Coach.findOne({
      _id: coachId,
      createdBy: admin._id,
    });

    if (!coach) {
      return res.status(404).json({
        success: false,
        message: "Coach not found",
      });
    }

    const allowedFields = [
      "profileImage",
      "experience",
      "specialization",
      "qualification",
      "description",
      "hourlyFee",
      "workingDays",
      "openingTime",
      "closingTime",
      "unavailableRanges",
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        coach[field] = req.body[field];
      }
    });

    if (coach.openingTime >= coach.closingTime) {
      return res.status(400).json({
        success: false,
        message: "Invalid working hours",
      });
    }

    for (const range of coach.unavailableRanges || []) {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(range.fromDate) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(range.toDate) ||
        range.fromDate > range.toDate
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid unavailable date range",
        });
      }
    }

    await coach.validate();

    if (req.body.name !== undefined) {
      if (typeof req.body.name !== "string" || !req.body.name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Valid name required",
        });
      }

      await User.updateOne(
        {
          _id: coach.userId,
          createdBy: admin._id,
          role: "coach",
        },
        {
          $set: {
            name: req.body.name.trim(),
          },
        },
        {
          runValidators: true,
        },
      );
    }

    await coach.save();

    const updatedCoach = await Coach.findById(coachId)
      .populate("userId", "name phone email")
      .lean();

    const complexes = await Complex.find({
      adminId: admin._id,
    })
      .select("name sports")
      .lean();

    return res.status(200).json({
      success: true,
      message: "Coach updated successfully",

      data: {
        coach: formatCoach(updatedCoach, complexes),
      },
    });
  } catch (error) {
    console.error("Update Coach Error:", error);

    return res.status(400).json({
      success: false,
      message: "Unable to update coach",
    });
  }
};

// ==========================================
// ACTIVATE / DEACTIVATE COACH
// PATCH /api/coaches/:coachId/status
// ==========================================

exports.updateCoachStatus = async (req, res) => {
  try {
    const admin = await getAdmin(req);

    if (!admin) {
      return res.status(403).json({
        success: false,
        message: "Complex admin access required",
      });
    }

    const { coachId } = req.params;
    const { isActive } = req.body;

    if (!isValidId(coachId) || typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "Invalid coach status",
      });
    }

    const coach = await Coach.findOne({
      _id: coachId,
      createdBy: admin._id,
    });

    if (!coach) {
      return res.status(404).json({
        success: false,
        message: "Coach not found",
      });
    }

    await User.updateOne(
      {
        _id: coach.userId,
        createdBy: admin._id,
        role: "coach",
      },
      {
        $set: {
          isActive,
        },
      },
    );

    coach.isActive = isActive;

    await coach.save();

    return res.status(200).json({
      success: true,

      message: isActive
        ? "Coach activated successfully"
        : "Coach deactivated successfully",

      data: {
        coachId: coach._id,
        isActive: coach.isActive,
      },
    });
  } catch (error) {
    console.error("Coach Status Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update coach status",
    });
  }
};

// ==========================================
// ASSIGN / UNASSIGN COACH TO SPORT
// PATCH /api/coaches/:coachId/assign-sport
// ==========================================

exports.assignCoach = async (req, res) => {
  try {
    const admin = await getAdmin(req);

    if (!admin) {
      return res.status(403).json({
        success: false,
        message: "Complex admin access required",
      });
    }

    const { coachId } = req.params;

    const { complexId, sportId, assign = true } = req.body;

    if (
      !isValidId(coachId) ||
      !isValidId(complexId) ||
      !isValidId(sportId) ||
      typeof assign !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid assignment details",
      });
    }

    const coach = await Coach.findOne({
      _id: coachId,
      createdBy: admin._id,
    });

    if (!coach) {
      return res.status(404).json({
        success: false,
        message: "Coach not found",
      });
    }

    if (assign && !coach.isActive) {
      return res.status(400).json({
        success: false,
        message: "Coach is inactive",
      });
    }

    const filter = {
      _id: complexId,
      adminId: admin._id,

      ...(assign ? { isActive: true } : {}),

      sports: {
        $elemMatch: {
          _id: sportId,

          ...(assign ? { isActive: true } : {}),
        },
      },
    };

    const update = assign
      ? {
          $addToSet: {
            "sports.$.coachIds": coach._id,
          },
        }
      : {
          $pull: {
            "sports.$.coachIds": coach._id,
          },
        };

    const complex = await Complex.findOneAndUpdate(filter, update, {
      new: true,
      runValidators: true,
    });

    if (!complex) {
      return res.status(404).json({
        success: false,
        message: "Complex or sport not found",
      });
    }

    const sport = complex.sports.id(sportId);

    return res.status(200).json({
      success: true,

      message: assign
        ? "Coach assigned successfully"
        : "Coach assignment removed successfully",

      data: {
        complexId: complex._id,
        sportId: sport._id,
        sportName: sport.name,
        coachIds: sport.coachIds,
      },
    });
  } catch (error) {
    console.error("Assign Coach Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to assign coach",
    });
  }
};

// ==========================================
// GET ASSIGNED COACHES FOR SPORT
// GET /api/coaches/complex/:complexId/sport/:sportId
// ==========================================

exports.getSportCoaches = async (req, res) => {
  try {
    const { complexId, sportId } = req.params;

    if (!isValidId(complexId) || !isValidId(sportId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid complex or sport ID",
      });
    }

    const complex = await Complex.findOne({
      _id: complexId,
      isActive: true,
    });

    if (!complex) {
      return res.status(404).json({
        success: false,
        message: "Complex not found",
      });
    }

    const sport = complex.sports.id(sportId);

    if (!sport || !sport.isActive) {
      return res.status(404).json({
        success: false,
        message: "Sport not found",
      });
    }

    const coaches = await Coach.find({
      _id: {
        $in: sport.coachIds || [],
      },

      createdBy: complex.adminId,

      isActive: true,
    })
      .populate({
        path: "userId",
        select: "name isActive",
        match: {
          role: "coach",
          isActive: true,
        },
      })
      .lean();

    const formattedCoaches = coaches
      .filter((coach) => coach.userId)
      .map((coach) => ({
        _id: coach._id,
        name: coach.userId.name,
        profileImage: coach.profileImage,
        experience: coach.experience,
        specialization: coach.specialization,
        qualification: coach.qualification,
        description: coach.description,
        hourlyFee: coach.hourlyFee,
        workingDays: coach.workingDays,
        openingTime: coach.openingTime,
        closingTime: coach.closingTime,
      }));

    return res.status(200).json({
      success: true,
      count: formattedCoaches.length,

      data: {
        complexId,
        sportId,
        coaches: formattedCoaches,
      },
    });
  } catch (error) {
    console.error("Get Sport Coaches Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch sport coaches",
    });
  }
};

// ==========================================
// GET AVAILABLE COACHES FOR BOOKING
// GET /api/coaches/availability
// ==========================================

exports.getAvailableCoaches = async (req, res) => {
  try {
    const { complexId, sportId, bookingDate, startTime, durationMinutes } =
      req.query;

    const duration = Number(durationMinutes);

    if (
      !isValidId(complexId) ||
      !isValidId(sportId) ||
      typeof bookingDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(bookingDate) ||
      typeof startTime !== "string" ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) ||
      !Number.isInteger(duration) ||
      duration < 15 ||
      duration > 1440 ||
      duration % 15 !== 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking details",
      });
    }

    const [hours, minutes] = startTime.split(":").map(Number);

    const start = hours * 60 + minutes;
    const end = start + duration;

    if (start % 15 !== 0 || end > 1440) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking time",
      });
    }

    const complex = await Complex.findOne({
      _id: complexId,
      isActive: true,
    });

    const sport = complex?.sports.id(sportId);

    if (!sport || !sport.isActive) {
      return res.status(404).json({
        success: false,
        message: "Complex or sport not found",
      });
    }

    const results = await Promise.all(
      (sport.coachIds || []).map(async (coachId) => {
        try {
          const result = await getAvailableCoach({
            coachId: String(coachId),
            complex,
            sport,
            bookingDate,
            start,
            end,
          });

          return {
            _id: result.coachId,
            name: result.name,
            profileImage: result.profileImage,
            experience: result.experience,
            specialization: result.specialization,
            hourlyFee: result.hourlyFee,
            coachAmount: result.amount,
            isAvailable: true,
          };
        } catch (error) {
          if (error.statusCode === 409) {
            return null;
          }

          throw error;
        }
      }),
    );

    const coaches = results.filter(Boolean);

    return res.status(200).json({
      success: true,
      count: coaches.length,

      data: {
        bookingDate,
        startTime,
        durationMinutes: duration,
        coaches,
      },
    });
  } catch (error) {
    console.error("Coach Availability Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch available coaches",
    });
  }
};

// ==========================================
// GET SPORT ADMIN'S ASSIGNED COACHES
// GET /api/coaches/my-assigned
// ==========================================

exports.getSubadminCoaches = async (req, res) => {
  try {
    const subadmin = await User.findOne({
      _id: req.user?.userId,
      role: "sport_admin",
      isActive: true,
    });

    if (!subadmin || !subadmin.createdBy) {
      return res.status(403).json({
        success: false,
        message: "Sport admin access required",
      });
    }

    const complexes = await Complex.find({
      adminId: subadmin.createdBy,
      isActive: true,

      sports: {
        $elemMatch: {
          primarySubAdminId: subadmin._id,
          isActive: true,
        },
      },
    }).lean();

    const assignedSports = [];

    complexes.forEach((complex) => {
      (complex.sports || []).forEach((sport) => {
        if (
          sport.isActive &&
          String(sport.primarySubAdminId) === String(subadmin._id)
        ) {
          assignedSports.push({
            complexId: complex._id,
            complexName: complex.name,
            sportId: sport._id,
            sportName: sport.name,
            coachIds: sport.coachIds || [],
          });
        }
      });
    });

    const coachIds = [
      ...new Set(assignedSports.flatMap((sport) => sport.coachIds.map(String))),
    ];

    const coaches = await Coach.find({
      _id: { $in: coachIds },
      createdBy: subadmin.createdBy,
    })
      .populate("userId", "name")
      .lean();

    const formattedCoaches = coaches.map((coach) => ({
      _id: coach._id,
      name: coach.userId?.name || "Coach",
      profileImage: coach.profileImage,
      specialization: coach.specialization,
      experience: coach.experience,
      hourlyFee: coach.hourlyFee,
      isActive: coach.isActive,

      assignedSports: assignedSports
        .filter((sport) =>
          sport.coachIds.some((id) => String(id) === String(coach._id)),
        )
        .map(({ coachIds, ...sport }) => sport),
    }));

    return res.status(200).json({
      success: true,
      count: formattedCoaches.length,

      data: {
        coaches: formattedCoaches,
      },
    });
  } catch (error) {
    console.error("Subadmin Coaches Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch assigned coaches",
    });
  }
};
