const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const uploadDirectory = path.join(__dirname, "../../uploads/complexes");

fs.mkdirSync(uploadDirectory, {
  recursive: true,
});

const allowedTypes = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirectory);
  },

  filename: (req, file, cb) => {
    const extension = allowedTypes[file.mimetype];

    const uniqueName = Date.now() + "-" + crypto.randomBytes(8).toString("hex");

    cb(null, `complex-${uniqueName}${extension}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (!allowedTypes[file.mimetype]) {
    return cb(new Error("Only JPG, PNG and WEBP images are allowed"));
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,

  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 20,
  },
});

exports.uploadComplexImage = (req, res, next) => {
  upload.single("image")(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        success: false,
        message:
          error.code === "LIMIT_FILE_SIZE"
            ? "Image size must not exceed 5 MB"
            : error.message || "Image upload failed",
      });
    }

    next();
  });
};
