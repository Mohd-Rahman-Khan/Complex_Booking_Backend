const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const MasterSport = require("../models/MasterSport");

// ==========================================
// HELPER FUNCTIONS
// ==========================================

const escapeRegex = (value) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const generateSlug = (value) => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const getUploadedFile = (req, fieldName) => {
  const file = req.files?.[fieldName]?.[0];

  if (!file) {
    return "";
  }

  return `/uploads/sports/${file.filename}`;
};

const deleteUploadedFile = async (filePath) => {
  if (
    typeof filePath !== "string" ||
    !/^\/uploads\/sports\/(image|icon)-[a-zA-Z0-9-]+\.(jpg|png|webp)$/.test(
      filePath,
    )
  ) {
    return;
  }

  try {
    const absolutePath = path.join(
      __dirname,
      "../../uploads/sports",
      path.basename(filePath),
    );

    await fs.promises.unlink(absolutePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Delete sport file error:", error.message);
    }
  }
};

const cleanupFiles = async (...files) => {
  await Promise.all(files.filter(Boolean).map(deleteUploadedFile));
};

// ==========================================
// GET ALL MASTER SPORTS
// GET /api/master-sports
// ==========================================

exports.getMasterSports = async (req, res) => {
  try {
    const sports = await MasterSport.find({
      isActive: true,
    })
      .select("name slug image icon description")
      .sort({ name: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: sports.length,
      data: {
        sports,
      },
    });
  } catch (error) {
    console.error("Get master sports error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch master sports",
    });
  }
};

// ==========================================
// GET MASTER SPORT BY ID
// GET /api/master-sports/:id
// ==========================================

exports.getMasterSportById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sport ID",
      });
    }

    const sport = await MasterSport.findOne({
      _id: id,
      isActive: true,
    }).lean();

    if (!sport) {
      return res.status(404).json({
        success: false,
        message: "Sport not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        sport,
      },
    });
  } catch (error) {
    console.error("Get master sport error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch sport",
    });
  }
};

// ==========================================
// CREATE MASTER SPORT
// POST /api/master-sports
// ==========================================

exports.createMasterSport = async (req, res) => {
  const uploadedImage = getUploadedFile(req, "image");

  const uploadedIcon = getUploadedFile(req, "icon");

  let saved = false;

  try {
    const { name, slug, icon, description } = req.body || {};

    // Validate name
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Sport name is required",
      });
    }

    // Validate optional text fields
    for (const value of [slug, icon, description]) {
      if (value !== undefined && typeof value !== "string") {
        return res.status(400).json({
          success: false,
          message: "Invalid sport details",
        });
      }
    }

    const sportName = name.trim();

    const sportSlug = generateSlug(slug || sportName);

    if (!sportSlug) {
      return res.status(400).json({
        success: false,
        message: "Valid sport slug is required",
      });
    }

    // Image mandatory for new sport
    if (!uploadedImage) {
      return res.status(400).json({
        success: false,
        message: "Sport image is required",
      });
    }

    // Icon file or existing emoji support
    const sportIcon = uploadedIcon || icon?.trim() || "";

    if (!sportIcon) {
      return res.status(400).json({
        success: false,
        message: "Sport icon is required",
      });
    }

    // Check duplicate name or slug
    const existingSport = await MasterSport.findOne({
      $or: [
        {
          name: {
            $regex: `^${escapeRegex(sportName)}$`,
            $options: "i",
          },
        },
        {
          slug: sportSlug,
        },
      ],
    });

    if (existingSport) {
      return res.status(409).json({
        success: false,
        message: "This sport already exists",
      });
    }

    const sport = await MasterSport.create({
      name: sportName,
      slug: sportSlug,

      image: uploadedImage,
      icon: sportIcon,

      description: description?.trim() || "",

      isActive: true,
    });

    saved = true;

    return res.status(201).json({
      success: true,
      message: "Sport created successfully",
      data: {
        sport,
      },
    });
  } catch (error) {
    console.error("Create master sport error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Sport name or slug already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to create sport",
    });
  } finally {
    // Remove newly uploaded files if creation fails
    if (!saved) {
      await cleanupFiles(uploadedImage, uploadedIcon);
    }
  }
};

// ==========================================
// UPDATE MASTER SPORT
// PUT /api/master-sports/:id
// ==========================================

exports.updateMasterSport = async (req, res) => {
  const uploadedImage = getUploadedFile(req, "image");

  const uploadedIcon = getUploadedFile(req, "icon");

  let saved = false;

  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sport ID",
      });
    }

    const sport = await MasterSport.findById(id);

    if (!sport) {
      return res.status(404).json({
        success: false,
        message: "Sport not found",
      });
    }

    const { name, slug, icon, description } = req.body || {};

    for (const value of [name, slug, icon, description]) {
      if (value !== undefined && typeof value !== "string") {
        return res.status(400).json({
          success: false,
          message: "Invalid sport details",
        });
      }
    }

    const sportName = name !== undefined ? name.trim() : sport.name;

    if (!sportName) {
      return res.status(400).json({
        success: false,
        message: "Sport name is required",
      });
    }

    const sportSlug = slug !== undefined ? generateSlug(slug) : sport.slug;

    if (!sportSlug) {
      return res.status(400).json({
        success: false,
        message: "Valid sport slug is required",
      });
    }

    // Check duplicate sport
    const existingSport = await MasterSport.findOne({
      _id: {
        $ne: id,
      },

      $or: [
        {
          name: {
            $regex: `^${escapeRegex(sportName)}$`,
            $options: "i",
          },
        },
        {
          slug: sportSlug,
        },
      ],
    });

    if (existingSport) {
      return res.status(409).json({
        success: false,
        message: "Sport name or slug already exists",
      });
    }

    const oldImage = sport.image;
    const oldIcon = sport.icon;

    sport.name = sportName;
    sport.slug = sportSlug;

    if (description !== undefined) {
      sport.description = description.trim();
    }

    // Update image only if new file uploaded
    if (uploadedImage) {
      sport.image = uploadedImage;
    }

    // Update icon file or emoji
    if (uploadedIcon) {
      sport.icon = uploadedIcon;
    } else if (icon !== undefined) {
      sport.icon = icon.trim();
    }

    await sport.save();

    saved = true;

    // Remove old files after successful update
    if (uploadedImage && oldImage) {
      await deleteUploadedFile(oldImage);
    }

    if (oldIcon && oldIcon !== sport.icon) {
      await deleteUploadedFile(oldIcon);
    }

    return res.status(200).json({
      success: true,
      message: "Sport updated successfully",
      data: {
        sport,
      },
    });
  } catch (error) {
    console.error("Update master sport error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Sport name or slug already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to update sport",
    });
  } finally {
    if (!saved) {
      await cleanupFiles(uploadedImage, uploadedIcon);
    }
  }
};

// ==========================================
// UPDATE MASTER SPORT STATUS
// PATCH /api/master-sports/:id/status
// ==========================================

exports.updateMasterSportStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const { isActive } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sport ID",
      });
    }

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive must be boolean",
      });
    }

    const sport = await MasterSport.findByIdAndUpdate(
      id,
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

    if (!sport) {
      return res.status(404).json({
        success: false,
        message: "Sport not found",
      });
    }

    return res.status(200).json({
      success: true,

      message: isActive
        ? "Sport activated successfully"
        : "Sport deactivated successfully",

      data: {
        sport,
      },
    });
  } catch (error) {
    console.error("Update sport status error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update sport status",
    });
  }
};
