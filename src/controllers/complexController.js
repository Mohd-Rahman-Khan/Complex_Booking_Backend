const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const Complex = require("../models/Complex");
const User = require("../models/User");

// ==========================================
// HELPER FUNCTIONS
// ==========================================

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

const escapeRegex = (value) => {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// Verify active complex admin
const findActiveAdmin = async (userId) => {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return null;
  }

  return User.findOne({
    _id: userId,
    role: "complex_admin",
    isActive: true,
  }).select("_id");
};

// Only allow admin to access their own complex
const findOwnedComplex = async (complexId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(complexId)) {
    return null;
  }

  const admin = await findActiveAdmin(userId);

  if (!admin) {
    return null;
  }

  return Complex.findOne({
    _id: complexId,
    adminId: admin._id,
  });
};

// Get uploaded image path
const getUploadedImage = (req) => {
  return req.file ? `/uploads/complexes/${req.file.filename}` : "";
};

// Delete uploaded image safely
const deleteUploadedImage = async (imagePath) => {
  if (
    typeof imagePath !== "string" ||
    !/^\/uploads\/complexes\/complex-[a-zA-Z0-9-]+\.(jpg|png|webp)$/.test(
      imagePath,
    )
  ) {
    return;
  }

  try {
    const filePath = path.join(
      __dirname,
      "../../uploads/complexes",
      path.basename(imagePath),
    );

    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Delete Image Error:", error.message);
    }
  }
};

// ==========================================
// 1. CREATE COMPLEX WITH IMAGE
// POST /api/complexes
// ==========================================

exports.createComplex = async (req, res) => {
  const uploadedImage = getUploadedImage(req);

  let saved = false;

  try {
    const admin = await findActiveAdmin(req.user?.userId);

    if (!admin) {
      return res.status(403).json({
        success: false,
        message: "Complex admin access required",
      });
    }

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

    const requiredFields = [name, ownerName, phone, address, city];

    const isValid = requiredFields.every(
      (value) => typeof value === "string" && value.trim().length > 0,
    );

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Name, owner, phone, address and city are required",
      });
    }

    if (email !== undefined && typeof email !== "string") {
      return res.status(400).json({
        success: false,
        message: "Invalid email",
      });
    }

    if (description !== undefined && typeof description !== "string") {
      return res.status(400).json({
        success: false,
        message: "Invalid description",
      });
    }

    if (!uploadedImage) {
      return res.status(400).json({
        success: false,
        message: "Complex image is required",
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

      email: email?.trim().toLowerCase() || undefined,

      address: address.trim(),

      city: city.trim(),

      description: description?.trim() || "",

      openingTime: open,

      closingTime: close,

      image: uploadedImage,

      adminId: admin._id,

      isActive: true,
    });

    saved = true;

    return res.status(201).json({
      success: true,

      message: "Complex created successfully",

      data: {
        complex,
      },
    });
  } catch (error) {
    console.error("Create Complex Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create complex",
    });
  } finally {
    // Delete image if database save failed
    if (!saved && uploadedImage) {
      await deleteUploadedImage(uploadedImage);
    }
  }
};

// ==========================================
// 2. GET ALL ACTIVE COMPLEXES
// GET /api/complexes
// ==========================================

exports.getAllComplexes = async (req, res) => {
  try {
    const { city, search } = req.query;

    const filter = {
      isActive: true,
    };

    if (city) {
      filter.city = new RegExp(`^${escapeRegex(city)}$`, "i");
    }

    if (search) {
      const safeSearch = escapeRegex(search);

      filter.$or = [
        {
          name: new RegExp(safeSearch, "i"),
        },
        {
          city: new RegExp(safeSearch, "i"),
        },
        {
          address: new RegExp(safeSearch, "i"),
        },
      ];
    }

    const complexes = await Complex.find(filter)
      .select("-unavailableRanges")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,

      count: complexes.length,

      data: {
        complexes,
      },
    });
  } catch (error) {
    console.error("Get Complexes Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch complexes",
    });
  }
};

// ==========================================
// 3. GET LOGGED-IN ADMIN COMPLEXES
// GET /api/complexes/my
// ==========================================

exports.getMyComplexes = async (req, res) => {
  try {
    const admin = await findActiveAdmin(req.user?.userId);

    if (!admin) {
      return res.status(403).json({
        success: false,
        message: "Complex admin access required",
      });
    }

    const complexes = await Complex.find({
      adminId: admin._id,
    }).sort({
      createdAt: -1,
    });

    return res.status(200).json({
      success: true,

      count: complexes.length,

      data: {
        complexes,
      },
    });
  } catch (error) {
    console.error("Get My Complexes Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch your complexes",
    });
  }
};

// ==========================================
// 4. GET SINGLE ACTIVE COMPLEX
// GET /api/complexes/:id
// ==========================================

exports.getComplexById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid complex ID",
      });
    }

    const complex = await Complex.findOne({
      _id: id,
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

      data: {
        complex,
      },
    });
  } catch (error) {
    console.error("Get Complex Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch complex",
    });
  }
};

// ==========================================
// 5. UPDATE COMPLEX WITH IMAGE
// PUT /api/complexes/:id
// ==========================================

exports.updateComplex = async (req, res) => {
  const uploadedImage = getUploadedImage(req);

  let saved = false;

  try {
    const complex = await findOwnedComplex(req.params.id, req.user?.userId);

    if (!complex) {
      return res.status(404).json({
        success: false,
        message: "Complex not found or access denied",
      });
    }

    const oldImage = complex.image;

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

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (typeof req.body[field] !== "string") {
          return res.status(400).json({
            success: false,
            message: `Invalid ${field}`,
          });
        }

        complex[field] = req.body[field].trim();
      }
    }

    const requiredFields = ["name", "ownerName", "phone", "address", "city"];

    const hasEmptyField = requiredFields.some(
      (field) => !complex[field]?.trim(),
    );

    if (hasEmptyField) {
      return res.status(400).json({
        success: false,
        message: "Required fields cannot be empty",
      });
    }

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

    // Replace image only if new image is uploaded
    if (uploadedImage) {
      complex.image = uploadedImage;
    }

    await complex.save();

    saved = true;

    // Delete old image after successful update
    if (uploadedImage && oldImage && oldImage !== uploadedImage) {
      await deleteUploadedImage(oldImage);
    }

    return res.status(200).json({
      success: true,

      message: "Complex updated successfully",

      data: {
        complex,
      },
    });
  } catch (error) {
    console.error("Update Complex Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update complex",
    });
  } finally {
    // Remove new image if update failed
    if (!saved && uploadedImage) {
      await deleteUploadedImage(uploadedImage);
    }
  }
};

// ==========================================
// 6. ACTIVATE / DEACTIVATE COMPLEX
// PATCH /api/complexes/:id/status
// ==========================================

exports.updateComplexStatus = async (req, res) => {
  try {
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive must be true or false",
      });
    }

    const complex = await findOwnedComplex(req.params.id, req.user?.userId);

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

      data: {
        complex,
      },
    });
  } catch (error) {
    console.error("Update Complex Status Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update complex status",
    });
  }
};

// ==========================================
// 7. ADD UNAVAILABLE DATE RANGE
// ==========================================

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

    const complex = await findOwnedComplex(req.params.id, req.user?.userId);

    if (!complex) {
      return res.status(404).json({
        success: false,
        message: "Complex not found or access denied",
      });
    }

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

// ==========================================
// 8. REMOVE UNAVAILABLE DATE RANGE
// ==========================================

exports.removeUnavailableDates = async (req, res) => {
  try {
    const complex = await findOwnedComplex(req.params.id, req.user?.userId);

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
