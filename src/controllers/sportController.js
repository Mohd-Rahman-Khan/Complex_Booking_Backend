const mongoose = require("mongoose");

const Complex = require("../models/Complex");
const User = require("../models/User");

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const isValidTime = (time) =>
  typeof time === "string" && /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);

const isValidPrice = (price) =>
  typeof price === "number" && Number.isFinite(price) && price >= 0;

const isValidBookingWindow = (days) =>
  Number.isInteger(days) && days >= 1 && days <= 365;

// Find complex and embedded sport for logged-in admin.
const getManageableSport = async (sportId, user) => {
  if (!isValidId(sportId)) return null;

  let query = {
    "sports._id": sportId,
  };

  if (user.role === "complex_admin") {
    query.adminId = user.userId;
  } else if (user.role === "sport_admin") {
    query.sports = {
      $elemMatch: {
        _id: sportId,
        primarySubAdminId: user.userId,
      },
    };
  } else {
    return null;
  }

  const complex = await Complex.findOne(query);

  if (!complex) return null;

  const sport = complex.sports.id(sportId);

  if (!sport) return null;

  return { complex, sport };
};

// 1. Create Sport inside Complex
exports.createSport = async (req, res) => {
  try {
    const { complexId, name, icon, description, bookingWindowDays } = req.body;

    if (!complexId || !isValidId(complexId)) {
      return res.status(400).json({
        success: false,
        message: "Valid complexId is required",
      });
    }

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Sport name is required",
      });
    }

    const windowDays = bookingWindowDays ?? 30;
    console.log(windowDays);

    if (!isValidBookingWindow(windowDays)) {
      return res.status(400).json({
        success: false,
        message: "Booking window must be between 1 and 365 days",
      });
    }

    const complex = await Complex.findOne({
      _id: complexId,
      adminId: req.user.userId,
      isActive: true,
    });

    if (!complex) {
      return res.status(404).json({
        success: false,
        message: "Complex not found or access denied",
      });
    }

    const alreadyExists = complex.sports.some(
      (sport) => sport.name.toLowerCase() === name.trim().toLowerCase(),
    );

    if (alreadyExists) {
      return res.status(409).json({
        success: false,
        message: "This sport already exists in this complex",
      });
    }

    complex.sports.push({
      name: name.trim(),
      icon: icon || "",
      description: description || "",
      bookingWindowDays: windowDays,
      primarySubAdminId: null,
      slots: [],
      pricing: {
        weekdayPrice: 0,
        weekdayPeakPrice: 0,
        weekendPrice: 0,
        weekendPeakPrice: 0,
        weekendDays: [0, 6],
        peakHours: [],
      },
      isActive: true,
    });

    await complex.save();

    const newSport = complex.sports[complex.sports.length - 1];

    return res.status(201).json({
      success: true,
      message: "Sport added to complex successfully",
      data: {
        sport: newSport,
        complexId: complex._id,
      },
    });
  } catch (error) {
    console.error("Create Sport Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to add sport",
    });
  }
};

// 2. Get active sports of a complex (Public)
exports.getSportsByComplex = async (req, res) => {
  try {
    const { complexId } = req.params;

    if (!isValidId(complexId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid complex ID",
      });
    }

    const complex = await Complex.findOne({
      _id: complexId,
      isActive: true,
    }).populate("sports.primarySubAdminId", "name phone");

    if (!complex) {
      return res.status(404).json({
        success: false,
        message: "Complex not found",
      });
    }

    const sports = complex.sports
      .filter((sport) => sport.isActive)
      .sort((a, b) => a.name.localeCompare(b.name));

    return res.status(200).json({
      success: true,
      count: sports.length,
      data: { sports },
    });
  } catch (error) {
    console.error("Get Sports Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch sports",
    });
  }
};

// 3. Get sports assigned to logged-in admin
exports.getMySports = async (req, res) => {
  try {
    let complexes = [];

    if (req.user.role === "complex_admin") {
      complexes = await Complex.find({
        adminId: req.user.userId,
      }).populate("sports.primarySubAdminId", "name phone");
    } else if (req.user.role === "sport_admin") {
      complexes = await Complex.find({
        "sports.primarySubAdminId": req.user.userId,
      }).populate("sports.primarySubAdminId", "name phone");
    } else {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const sports = [];

    for (const complex of complexes) {
      const assignedSports = complex.sports.filter((sport) => {
        if (req.user.role === "complex_admin") return true;

        return (
          String(sport.primarySubAdminId?._id || sport.primarySubAdminId) ===
          String(req.user.userId)
        );
      });

      for (const sport of assignedSports) {
        sports.push({
          ...sport.toObject(),
          complexId: {
            _id: complex._id,
            name: complex.name,
            city: complex.city,
          },
        });
      }
    }

    sports.sort(
      (a, b) =>
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime(),
    );

    return res.status(200).json({
      success: true,
      count: sports.length,
      data: { sports },
    });
  } catch (error) {
    console.error("Get My Sports Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch assigned sports",
    });
  }
};

// 4. Get one sport by embedded sport ID
exports.getSportById = async (req, res) => {
  try {
    const { sportId } = req.params;

    if (!isValidId(sportId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sport ID",
      });
    }

    let result = null;

    if (req.user) {
      result = await getManageableSport(sportId, req.user);
    }

    // Public active sport fallback
    if (!result) {
      const complex = await Complex.findOne({
        "sports._id": sportId,
        isActive: true,
      }).populate("sports.primarySubAdminId", "name phone");

      if (complex) {
        const sport = complex.sports.id(sportId);

        if (sport?.isActive) {
          result = { complex, sport };
        }
      }
    }

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Sport not found",
      });
    }

    const { complex, sport } = result;

    return res.status(200).json({
      success: true,
      data: {
        sport,
        complex: {
          _id: complex._id,
          name: complex.name,
          city: complex.city,
          openingTime: complex.openingTime,
          closingTime: complex.closingTime,
        },
      },
    });
  } catch (error) {
    console.error("Get Sport Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch sport",
    });
  }
};

// 5. Update sport details, slots and pricing
exports.updateSport = async (req, res) => {
  try {
    const result = await getManageableSport(req.params.sportId, req.user);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Sport not found or access denied",
      });
    }

    const { complex, sport } = result;

    const { name, icon, description, slots, bookingWindowDays, pricing } =
      req.body;

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Valid sport name is required",
        });
      }

      const duplicate = complex.sports.some(
        (item) =>
          String(item._id) !== String(sport._id) &&
          item.name.toLowerCase() === name.trim().toLowerCase(),
      );

      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: "This sport name already exists in this complex",
        });
      }

      sport.name = name.trim();
    }

    if (icon !== undefined) sport.icon = icon;
    if (description !== undefined) sport.description = description;

    if (bookingWindowDays !== undefined) {
      if (!isValidBookingWindow(bookingWindowDays)) {
        return res.status(400).json({
          success: false,
          message: "Booking window must be between 1 and 365 days",
        });
      }

      sport.bookingWindowDays = bookingWindowDays;
    }

    if (slots !== undefined) {
      if (!Array.isArray(slots)) {
        return res.status(400).json({
          success: false,
          message: "Slots must be an array",
        });
      }

      for (const slot of slots) {
        if (
          !isValidTime(slot.startTime) ||
          !isValidTime(slot.endTime) ||
          slot.endTime <= slot.startTime ||
          !Number.isInteger(slot.duration) ||
          slot.duration < 15 ||
          !isValidPrice(slot.price)
        ) {
          return res.status(400).json({
            success: false,
            message: "Invalid slot configuration",
          });
        }
      }

      sport.slots = slots;
    }

    if (pricing !== undefined) {
      if (!pricing || typeof pricing !== "object" || Array.isArray(pricing)) {
        return res.status(400).json({
          success: false,
          message: "Invalid pricing object",
        });
      }

      const allowedFields = [
        "weekdayPrice",
        "weekdayPeakPrice",
        "weekendPrice",
        "weekendPeakPrice",
      ];

      for (const field of allowedFields) {
        if (pricing[field] !== undefined) {
          if (!isValidPrice(pricing[field])) {
            return res.status(400).json({
              success: false,
              message: `Invalid ${field}`,
            });
          }

          sport.pricing[field] = pricing[field];
        }
      }

      if (pricing.weekendDays !== undefined) {
        if (
          !Array.isArray(pricing.weekendDays) ||
          pricing.weekendDays.some(
            (day) => !Number.isInteger(day) || day < 0 || day > 6,
          )
        ) {
          return res.status(400).json({
            success: false,
            message: "Weekend days must contain numbers from 0 to 6",
          });
        }

        sport.pricing.weekendDays = [...new Set(pricing.weekendDays)];
      }

      if (pricing.peakHours !== undefined) {
        if (!Array.isArray(pricing.peakHours)) {
          return res.status(400).json({
            success: false,
            message: "Peak hours must be an array",
          });
        }

        for (const peak of pricing.peakHours) {
          if (
            !isValidTime(peak.startTime) ||
            !isValidTime(peak.endTime) ||
            peak.endTime <= peak.startTime ||
            !isValidPrice(peak.price)
          ) {
            return res.status(400).json({
              success: false,
              message: "Invalid peak hour configuration",
            });
          }
        }

        sport.pricing.peakHours = pricing.peakHours;
      }
    }

    await complex.save();

    return res.status(200).json({
      success: true,
      message: "Sport updated successfully",
      data: { sport, complexId: complex._id },
    });
  } catch (error) {
    console.error("Update Sport Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update sport",
    });
  }
};

// 6. Assign primary sport admin
exports.assignPrimarySubAdmin = async (req, res) => {
  try {
    const { subAdminId } = req.body;

    if (!isValidId(subAdminId)) {
      return res.status(400).json({
        success: false,
        message: "Valid subAdminId is required",
      });
    }

    if (req.user.role !== "complex_admin") {
      return res.status(403).json({
        success: false,
        message: "Only Complex Admin can assign Sport Admin",
      });
    }

    const result = await getManageableSport(req.params.sportId, req.user);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Sport not found or access denied",
      });
    }

    const { complex, sport } = result;

    const subAdmin = await User.findOne({
      _id: subAdminId,
      complexId: complex._id,
      role: "sport_admin",
      isActive: true,
    });

    if (!subAdmin) {
      return res.status(404).json({
        success: false,
        message: "Active Sport Admin not found",
      });
    }

    sport.primarySubAdminId = subAdmin._id;

    await complex.save();

    return res.status(200).json({
      success: true,
      message: "Primary Sport Admin assigned successfully",
      data: {
        sportId: sport._id,
        primarySubAdmin: {
          id: subAdmin._id,
          name: subAdmin.name,
          phone: subAdmin.phone,
        },
      },
    });
  } catch (error) {
    console.error("Assign Sport Admin Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to assign Sport Admin",
    });
  }
};

// 7. Update booking window
exports.updateBookingWindow = async (req, res) => {
  try {
    const { days } = req.body;
    console.log(days);

    if (!isValidBookingWindow(days)) {
      return res.status(400).json({
        success: false,
        message: "Booking window must be between 1 and 365 days",
      });
    }

    const result = await getManageableSport(req.params.sportId, req.user);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Sport not found or access denied",
      });
    }

    result.sport.bookingWindowDays = days;

    await result.complex.save();

    return res.status(200).json({
      success: true,
      message: "Booking window updated successfully",
      data: {
        sportId: result.sport._id,
        bookingWindowDays: result.sport.bookingWindowDays,
      },
    });
  } catch (error) {
    console.error("Update Booking Window Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update booking window",
    });
  }
};

// 8. Update pricing
exports.updateSportPricing = async (req, res) => {
  try {
    // Reuse updateSport validation without mutating req.body.
    req.body = {
      pricing: req.body,
    };

    return exports.updateSport(req, res);
  } catch (error) {
    console.error("Update Pricing Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update pricing",
    });
  }
};

// 9. Activate / deactivate sport
exports.updateSportStatus = async (req, res) => {
  try {
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive must be true or false",
      });
    }

    if (req.user.role !== "complex_admin") {
      return res.status(403).json({
        success: false,
        message: "Only Complex Admin can change sport status",
      });
    }

    const result = await getManageableSport(req.params.sportId, req.user);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Sport not found or access denied",
      });
    }

    result.sport.isActive = isActive;

    await result.complex.save();

    return res.status(200).json({
      success: true,
      message: `Sport ${isActive ? "activated" : "deactivated"} successfully`,
      data: { sport: result.sport },
    });
  } catch (error) {
    console.error("Update Sport Status Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update sport status",
    });
  }
};
