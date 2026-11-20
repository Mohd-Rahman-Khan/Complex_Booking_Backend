const mongoose = require("mongoose");
const Complex = require("../models/Complex");

const isValidTime = (time) => {
  return typeof time === "string" && /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);
};

const isValidDate = (date) => {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );
};

// Only allow the logged-in admin to access their own complex.
const findOwnedComplex = async (complexId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(complexId)) {
    return null;
  }

  return Complex.findOne({
    _id: complexId,
    adminId: userId,
  });
};

// 1. Create Complex
exports.createComplex = async (req, res) => {
  try {
    const {
      name,
      ownerName,
      phone,
      email,
      address,
      city,
      description,
      openingTime,
      closingTime,
    } = req.body;

    if (!name || !ownerName || !phone || !address || !city) {
      return res.status(400).json({
        success: false,
        message: "Name, owner, phone, address and city are required",
      });
    }

    const open = openingTime || "06:00";
    const close = closingTime || "23:00";

    if (!isValidTime(open) || !isValidTime(close)) {
      return res.status(400).json({
        success: false,
        message: "Time must be in HH:mm format",
      });
    }

    if (close <= open) {
      return res.status(400).json({
        success: false,
        message: "Closing time must be after opening time",
      });
    }

    const complex = await Complex.create({
      name: name.trim(),
      ownerName: ownerName.trim(),
      phone: phone.trim(),
      email: email?.trim().toLowerCase(),
      address: address.trim(),
      city: city.trim(),
      description: description || "",
      openingTime: open,
      closingTime: close,
      adminId: req.user.userId,
    });

    return res.status(201).json({
      success: true,
      message: "Complex created successfully",
      data: { complex },
    });
  } catch (error) {
    console.error("Create Complex Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create complex",
    });
  }
};

// 2. Get active complexes (Customer/public listing)
exports.getAllComplexes = async (req, res) => {
  try {
    const { city, search } = req.query;

    const filter = {
      isActive: true,
    };

    if (city) {
      filter.city = new RegExp(`^${city}$`, "i");
    }

    if (search) {
      const safeSearch = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      filter.$or = [
        { name: new RegExp(safeSearch, "i") },
        { city: new RegExp(safeSearch, "i") },
        { address: new RegExp(safeSearch, "i") },
      ];
    }

    const complexes = await Complex.find(filter)
      .select("-unavailableRanges")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: complexes.length,
      data: { complexes },
    });
  } catch (error) {
    console.error("Get Complexes Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch complexes",
    });
  }
};

// 3. Get complexes assigned to logged-in admin
exports.getMyComplexes = async (req, res) => {
  try {
    const complexes = await Complex.find({
      adminId: req.user.userId,
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: complexes.length,
      data: { complexes },
    });
  } catch (error) {
    console.error("Get My Complexes Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch your complexes",
    });
  }
};

// 4. Get single active complex
exports.getComplexById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid complex ID",
      });
    }

    const complex = await Complex.findOne({
      _id: req.params.id,
      isActive: true,
    });

    if (!complex) {
      return res.status(404).json({
        success: false,
        message: "Complex not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: { complex },
    });
  } catch (error) {
    console.error("Get Complex Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch complex",
    });
  }
};

// 5. Update own complex
exports.updateComplex = async (req, res) => {
  try {
    const complex = await findOwnedComplex(req.params.id, req.user.userId);

    if (!complex) {
      return res.status(404).json({
        success: false,
        message: "Complex not found or access denied",
      });
    }

    const allowedFields = [
      "name",
      "ownerName",
      "phone",
      "email",
      "address",
      "city",
      "description",
      "openingTime",
      "closingTime",
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        complex[field] =
          typeof req.body[field] === "string"
            ? req.body[field].trim()
            : req.body[field];
      }
    });

    if (req.body.email !== undefined) {
      complex.email = req.body.email.trim().toLowerCase();
    }

    if (
      !isValidTime(complex.openingTime) ||
      !isValidTime(complex.closingTime)
    ) {
      return res.status(400).json({
        success: false,
        message: "Time must be in HH:mm format",
      });
    }

    if (complex.closingTime <= complex.openingTime) {
      return res.status(400).json({
        success: false,
        message: "Closing time must be after opening time",
      });
    }

    await complex.save();

    return res.status(200).json({
      success: true,
      message: "Complex updated successfully",
      data: { complex },
    });
  } catch (error) {
    console.error("Update Complex Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update complex",
    });
  }
};

// 6. Active / Inactive complex
exports.updateComplexStatus = async (req, res) => {
  try {
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive must be true or false",
      });
    }

    const complex = await findOwnedComplex(req.params.id, req.user.userId);

    if (!complex) {
      return res.status(404).json({
        success: false,
        message: "Complex not found or access denied",
      });
    }

    complex.isActive = isActive;
    await complex.save();

    return res.status(200).json({
      success: true,
      message: `Complex ${isActive ? "activated" : "deactivated"} successfully`,
      data: { complex },
    });
  } catch (error) {
    console.error("Update Complex Status Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update complex status",
    });
  }
};

// 7. Add unavailable date range
exports.addUnavailableDates = async (req, res) => {
  try {
    const { fromDate, toDate, reason } = req.body;

    if (!isValidDate(fromDate) || !isValidDate(toDate)) {
      return res.status(400).json({
        success: false,
        message: "Dates must be valid YYYY-MM-DD dates",
      });
    }

    if (toDate < fromDate) {
      return res.status(400).json({
        success: false,
        message: "End date cannot be before start date",
      });
    }

    const complex = await findOwnedComplex(req.params.id, req.user.userId);

    if (!complex) {
      return res.status(404).json({
        success: false,
        message: "Complex not found or access denied",
      });
    }

    // Prevent overlapping unavailable ranges.
    const hasOverlap = complex.unavailableRanges.some((range) => {
      return fromDate <= range.toDate && toDate >= range.fromDate;
    });

    if (hasOverlap) {
      return res.status(409).json({
        success: false,
        message: "This date range overlaps an existing unavailable range",
      });
    }

    complex.unavailableRanges.push({
      fromDate,
      toDate,
      reason: reason || "",
    });

    await complex.save();

    return res.status(201).json({
      success: true,
      message: "Unavailable dates added successfully",
      data: {
        unavailableRanges: complex.unavailableRanges,
      },
    });
  } catch (error) {
    console.error("Add Unavailable Dates Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to add unavailable dates",
    });
  }
};

// 8. Remove unavailable date range
exports.removeUnavailableDates = async (req, res) => {
  try {
    const complex = await findOwnedComplex(req.params.id, req.user.userId);

    if (!complex) {
      return res.status(404).json({
        success: false,
        message: "Complex not found or access denied",
      });
    }

    const range = complex.unavailableRanges.id(req.params.rangeId);

    if (!range) {
      return res.status(404).json({
        success: false,
        message: "Unavailable date range not found",
      });
    }

    range.deleteOne();
    await complex.save();

    return res.status(200).json({
      success: true,
      message: "Unavailable date range removed successfully",
      data: {
        unavailableRanges: complex.unavailableRanges,
      },
    });
  } catch (error) {
    console.error("Remove Unavailable Dates Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to remove unavailable dates",
    });
  }
};
