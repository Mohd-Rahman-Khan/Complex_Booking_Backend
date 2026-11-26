const mongoose = require("mongoose");

const User = require("../models/User");
const Complex = require("../models/Complex");
const Booking = require("../models/Booking");

// ==========================================
// HELPERS
// ==========================================

const isValidId = (id) =>
  typeof id === "string" && mongoose.Types.ObjectId.isValid(id);

const getAdmin = async (req) => {
  const userId = req.user?.userId;

  if (!userId) return null;

  return User.findOne({
    _id: userId,
    role: "complex_admin",
    isActive: true,
  });
};

const getOwnedComplex = async (complexId, adminId) => {
  return Complex.findOne({
    _id: complexId,
    adminId,
  });
};

const formatSubadmin = (subadmin, complexes = []) => {
  const assignedSports = [];

  complexes.forEach((complex) => {
    (complex.sports || []).forEach((sport) => {
      if (String(sport.primarySubAdminId) === String(subadmin._id)) {
        assignedSports.push({
          _id: sport._id,
          sportId: sport._id,
          name: sport.name,
          icon: sport.icon,
          complexId: complex._id,
          complexName: complex.name,
          isActive: sport.isActive,
        });
      }
    });
  });

  return {
    _id: subadmin._id,
    id: subadmin._id.toString(),
    name: subadmin.name,
    email: subadmin.email,
    phone: subadmin.phone,
    role: subadmin.role,
    createdBy: subadmin.createdBy,
    isActive: subadmin.isActive,
    isPhoneVerified: subadmin.isPhoneVerified,
    assignedSports,
    assignedSportIds: assignedSports.map((sport) => sport.sportId),
    createdAt: subadmin.createdAt,
  };
};

// ==========================================
// CREATE SUBADMIN
// POST /api/subadmins
// ==========================================

exports.createSubadmin = async (req, res) => {
  try {
    const admin = await getAdmin(req);

    if (!admin) {
      return res.status(403).json({
        success: false,
        message: "Complex admin access required",
      });
    }

    const { name, phone, email } = req.body;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof phone !== "string" ||
      !/^\+?[0-9]{10,15}$/.test(phone.trim())
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid name and phone are required",
      });
    }

    if (email != null && typeof email !== "string") {
      return res.status(400).json({
        success: false,
        message: "Invalid email address",
      });
    }

    const normalizedPhone = phone.trim();

    const normalizedEmail = email?.trim().toLowerCase();

    if (
      normalizedEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address",
      });
    }

    const duplicateConditions = [
      {
        phone: normalizedPhone,
      },
    ];

    if (normalizedEmail) {
      duplicateConditions.push({
        email: normalizedEmail,
      });
    }

    const existingUser = await User.findOne({
      $or: duplicateConditions,
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Mobile number or email is already registered",
      });
    }

    const subadmin = await User.create({
      name: name.trim(),
      phone: normalizedPhone,
      email: normalizedEmail || undefined,

      role: "sport_admin",

      // Main admin ownership
      createdBy: admin._id,

      // Subadmin can manage multiple complexes
      complexId: null,

      isActive: true,
      isPhoneVerified: false,
    });

    return res.status(201).json({
      success: true,
      message: "Subadmin created successfully",
      data: {
        subadmin: formatSubadmin(subadmin),
      },
    });
  } catch (error) {
    console.error("Create Subadmin Error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Phone or email already registered",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to create subadmin",
    });
  }
};

// ==========================================
// GET ALL SUBADMINS OF LOGGED-IN ADMIN
// GET /api/subadmins
// ==========================================

exports.getSubadmins = async (req, res) => {
  try {
    const admin = await getAdmin(req);

    if (!admin) {
      return res.status(403).json({
        success: false,
        message: "Complex admin access required",
      });
    }

    const [subadmins, complexes] = await Promise.all([
      User.find({
        role: "sport_admin",
        createdBy: admin._id,
      })
        .sort({ createdAt: -1 })
        .lean(),

      Complex.find({
        adminId: admin._id,
      })
        .select("name sports")
        .lean(),
    ]);

    const formattedSubadmins = subadmins.map((subadmin) =>
      formatSubadmin(subadmin, complexes),
    );

    return res.status(200).json({
      success: true,
      message: "Subadmins fetched successfully",
      count: formattedSubadmins.length,

      data: {
        subadmins: formattedSubadmins,
      },
    });
  } catch (error) {
    console.error("Get Subadmins Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch subadmins",
    });
  }
};

// ==========================================
// GET COMPLEX SPORTS + ALL ADMIN SUBADMINS
// GET /api/subadmins/complex/:complexId
// ==========================================

exports.getComplexSubadmins = async (req, res) => {
  try {
    const admin = await getAdmin(req);

    if (!admin) {
      return res.status(403).json({
        success: false,
        message: "Complex admin access required",
      });
    }

    const { complexId } = req.params;

    if (!isValidId(complexId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid complex ID",
      });
    }

    const complex = await getOwnedComplex(complexId, admin._id);

    if (!complex) {
      return res.status(404).json({
        success: false,
        message: "Complex not found",
      });
    }

    // Fetch subadmins using createdBy.
    // Do not filter using subadmin.complexId.

    const [subadmins, allComplexes] = await Promise.all([
      User.find({
        role: "sport_admin",
        createdBy: admin._id,
      })
        .sort({ createdAt: -1 })
        .lean(),

      Complex.find({
        adminId: admin._id,
      })
        .select("name sports")
        .lean(),
    ]);

    const formattedSubadmins = subadmins.map((subadmin) =>
      formatSubadmin(subadmin, allComplexes),
    );

    return res.status(200).json({
      success: true,
      message: "Subadmins fetched successfully",
      count: formattedSubadmins.length,

      data: {
        complex: {
          _id: complex._id,
          name: complex.name,
          ownerName: complex.ownerName,
          sports: complex.sports,
        },

        subadmins: formattedSubadmins,
      },
    });
  } catch (error) {
    console.error("Get Complex Subadmins Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch subadmins",
    });
  }
};

// ==========================================
// ASSIGN / REPLACE / UNASSIGN SPORT
// PATCH /api/subadmins/:subadminId/assign-sport
// ==========================================

exports.assignSport = async (req, res) => {
  try {
    const admin = await getAdmin(req);

    if (!admin) {
      return res.status(403).json({
        success: false,
        message: "Complex admin access required",
      });
    }

    const { subadminId } = req.params;

    const {
      complexId,
      sportId,
      assign = true,
      replace = false,
      expectedPrimarySubAdminId = null,
    } = req.body;

    if (
      !isValidId(complexId) ||
      !isValidId(sportId) ||
      !isValidId(subadminId) ||
      typeof assign !== "boolean" ||
      typeof replace !== "boolean" ||
      (expectedPrimarySubAdminId !== null &&
        !isValidId(expectedPrimarySubAdminId))
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid assignment details",
      });
    }

    // Verify subadmin ownership

    const subadmin = await User.findOne({
      _id: subadminId,
      role: "sport_admin",
      createdBy: admin._id,
    });

    if (!subadmin) {
      return res.status(404).json({
        success: false,
        message: "Subadmin not found",
      });
    }

    if (assign && !subadmin.isActive) {
      return res.status(400).json({
        success: false,
        message: "Subadmin account is inactive",
      });
    }

    // Verify complex ownership

    const complex = await getOwnedComplex(complexId, admin._id);

    if (!complex) {
      return res.status(404).json({
        success: false,
        message: "Complex not found",
      });
    }

    // Find embedded sport

    const sport = complex.sports.id(sportId);

    if (!sport) {
      return res.status(404).json({
        success: false,
        message: "Sport not found",
      });
    }

    if (assign && (!sport.isActive || !complex.isActive)) {
      return res.status(400).json({
        success: false,
        message: "Complex or sport is inactive",
      });
    }

    const previousAdminId = sport.primarySubAdminId || null;

    let sportCondition;

    // Unassign existing subadmin

    if (!assign) {
      sportCondition = {
        _id: sportId,
        primarySubAdminId: subadmin._id,
      };
    }

    // Replace existing subadmin
    else if (replace) {
      sportCondition = {
        _id: sportId,
        isActive: true,
        primarySubAdminId: expectedPrimarySubAdminId,
      };
    }

    // Assign new subadmin
    else {
      sportCondition = {
        _id: sportId,
        isActive: true,

        $or: [
          {
            primarySubAdminId: null,
          },
          {
            primarySubAdminId: subadmin._id,
          },
        ],
      };
    }

    // Atomic assignment update

    const updatedComplex = await Complex.findOneAndUpdate(
      {
        _id: complexId,
        adminId: admin._id,

        ...(assign ? { isActive: true } : {}),

        sports: {
          $elemMatch: sportCondition,
        },
      },
      {
        $set: {
          "sports.$.primarySubAdminId": assign ? subadmin._id : null,
        },
      },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!updatedComplex) {
      return res.status(409).json({
        success: false,
        message: "Assignment changed. Please refresh and try again.",
      });
    }

    const updatedSport = updatedComplex.sports.id(sportId);

    return res.status(200).json({
      success: true,

      message: assign
        ? "Sport assigned successfully"
        : "Sport assignment removed successfully",

      data: {
        complexId: updatedComplex._id,

        sportId: updatedSport._id,

        sportName: updatedSport.name,

        previousSubAdminId: previousAdminId,

        primarySubAdminId: updatedSport.primarySubAdminId || null,
      },
    });
  } catch (error) {
    console.error("Assign Sport Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to assign sport",
    });
  }
};

// ==========================================
// UPDATE SUBADMIN STATUS
// PATCH /api/subadmins/:subadminId/status
// ==========================================

exports.updateSubadminStatus = async (req, res) => {
  try {
    const admin = await getAdmin(req);

    if (!admin) {
      return res.status(403).json({
        success: false,
        message: "Complex admin access required",
      });
    }

    const { subadminId } = req.params;

    const { isActive } = req.body;

    if (!isValidId(subadminId) || typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "Invalid account status",
      });
    }

    const subadmin = await User.findOneAndUpdate(
      {
        _id: subadminId,
        role: "sport_admin",
        createdBy: admin._id,
      },
      {
        $set: {
          isActive,
        },
      },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!subadmin) {
      return res.status(404).json({
        success: false,
        message: "Subadmin not found",
      });
    }

    return res.status(200).json({
      success: true,

      message: isActive
        ? "Subadmin activated successfully"
        : "Subadmin deactivated successfully",

      data: {
        subadmin: formatSubadmin(subadmin),
      },
    });
  } catch (error) {
    console.error("Update Status Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update account status",
    });
  }
};

// ==========================================
// GET LOGGED-IN SUBADMIN ASSIGNED SPORTS
// GET /api/subadmins/my-sports
// ==========================================

exports.getMySports = async (req, res) => {
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

    // Find only assigned active complexes and sports

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
            ...sport,

            sportId: sport._id,

            complexId: complex._id,

            complexName: complex.name,

            address: complex.address,

            city: complex.city,

            openingTime: complex.openingTime,

            closingTime: complex.closingTime,
          });
        }
      });
    });

    return res.status(200).json({
      success: true,

      count: assignedSports.length,

      data: {
        sports: assignedSports,
      },
    });
  } catch (error) {
    console.error("Get My Sports Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch assigned sports",
    });
  }
};

// ==========================================
// GET LOGGED-IN SUBADMIN ASSIGNED BOOKINGS
// GET /api/subadmins/my-bookings
// ==========================================

exports.getMyBookings = async (req, res) => {
  try {
    const userId = req.user?.userId;

    // Validate logged-in user

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    // Find logged-in sport admin

    const subadmin = await User.findOne({
      _id: userId,
      role: "sport_admin",
      isActive: true,
    }).lean();

    if (!subadmin || !subadmin.createdBy) {
      return res.status(403).json({
        success: false,
        message: "Sport admin access required",
      });
    }

    // ======================================
    // FIND ASSIGNED COMPLEXES
    // ======================================

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

    // ======================================
    // PREPARE ASSIGNED SPORTS
    // ======================================

    const assignedSports = [];

    complexes.forEach((complex) => {
      (complex.sports || []).forEach((sport) => {
        if (
          sport.isActive &&
          String(sport.primarySubAdminId) === String(subadmin._id)
        ) {
          assignedSports.push({
            complexId: complex._id,

            sportId: sport._id,

            complexName: complex.name,

            sportName: sport.name,

            icon: sport.icon,
          });
        }
      });
    });

    // ======================================
    // PREPARE BOOKING QUERY
    // ======================================

    // Both complexId and sportId must match.

    const bookingConditions = assignedSports.map((sport) => ({
      complexId: sport.complexId,

      sportId: sport.sportId,
    }));

    // ======================================
    // FETCH ASSIGNED BOOKINGS
    // ======================================

    const bookings = bookingConditions.length
      ? await Booking.find({
          $or: bookingConditions,
        })
          .populate("userId", "name phone")
          .sort({ createdAt: -1 })
          .lean()
      : [];

    // ======================================
    // FORMAT BOOKING RESPONSE
    // ======================================

    const formattedBookings = bookings.map((booking) => {
      const assignedSport = assignedSports.find(
        (sport) =>
          String(sport.complexId) === String(booking.complexId) &&
          String(sport.sportId) === String(booking.sportId),
      );

      // Actual booking amount

      const rawAmount = Number(
        booking.price?.totalAmount ??
          booking.totalAmount ??
          booking.amount ??
          0,
      );

      const totalAmount = Number.isFinite(rawAmount) ? rawAmount : 0;

      return {
        _id: booking._id,

        bookingNumber: booking.bookingNumber,

        // Normalize IDs for frontend comparison

        complexId: String(booking.complexId),

        sportId: String(booking.sportId),

        complexName: assignedSport?.complexName || "",

        sportName: assignedSport?.sportName || "",

        icon: assignedSport?.icon || "",

        // Customer details

        userId: booking.userId,

        customerName: booking.userId?.name || "Customer",

        // Booking details

        bookingDate: booking.bookingDate,

        startTime: booking.startTime,

        endTime: booking.endTime,

        durationMinutes: booking.durationMinutes,

        status: booking.status,

        paymentStatus: booking.paymentStatus,

        // Booking pricing

        price: booking.price,

        totalAmount,

        createdAt: booking.createdAt,
      };
    });

    // ======================================
    // CONFIRMED BOOKINGS
    // ======================================

    const confirmedBookings = formattedBookings.filter(
      (booking) => String(booking.status).toLowerCase() === "confirmed",
    );

    // ======================================
    // CANCELLED BOOKINGS
    // ======================================

    const cancelledBookings = formattedBookings.filter(
      (booking) => String(booking.status).toLowerCase() === "cancelled",
    );

    // ======================================
    // TOTAL BOOKING AMOUNT
    // ======================================

    // Includes all confirmed bookings,
    // irrespective of payment status.

    const totalBookingAmount = confirmedBookings.reduce(
      (total, booking) => total + booking.totalAmount,
      0,
    );

    // ======================================
    // TOTAL PAID REVENUE
    // ======================================

    // Includes only confirmed and paid bookings.

    const totalRevenue = confirmedBookings
      .filter(
        (booking) => String(booking.paymentStatus).toLowerCase() === "paid",
      )
      .reduce((total, booking) => total + booking.totalAmount, 0);

    // ======================================
    // SUCCESS RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,

      message: "Assigned sport bookings fetched successfully",

      count: formattedBookings.length,

      data: {
        bookings: formattedBookings,

        totalBookings: formattedBookings.length,

        confirmedBookings: confirmedBookings.length,

        cancelledBookings: cancelledBookings.length,

        totalBookingAmount,

        totalRevenue,

        totalAssignedSports: assignedSports.length,

        totalComplexes: complexes.length,
      },
    });
  } catch (error) {
    console.error("Get Subadmin Bookings Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch assigned sport bookings",
    });
  }
};
