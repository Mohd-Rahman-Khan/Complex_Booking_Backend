const MasterSport = require("../models/MasterSport");

// GET /api/master-sports
exports.getMasterSports = async (req, res) => {
  try {
    const sports = await MasterSport.find({
      isActive: true,
    })
      .select("name slug icon description")
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

// POST /api/master-sports
exports.createMasterSport = async (req, res) => {
  try {
    const { name, slug, icon, description } = req.body;

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Sport name is required",
      });
    }

    const sportName = name.trim();

    // Generate slug automatically if not provided
    const sportSlug = (slug || sportName)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    if (!sportSlug) {
      return res.status(400).json({
        success: false,
        message: "Valid sport slug is required",
      });
    }

    // Check duplicate name or slug
    const existingSport = await MasterSport.findOne({
      $or: [
        {
          name: {
            $regex: `^${sportName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            $options: "i",
          },
        },
        { slug: sportSlug },
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
      icon: icon || "",
      description: description || "",
      isActive: true,
    });

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
  }
};
