const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const uploadDirectory = path.join(__dirname, "../../uploads/sports");

// Create upload directory automatically
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

    const uniqueName =
      `${file.fieldname}-${Date.now()}-` +
      `${crypto.randomBytes(8).toString("hex")}` +
      extension;

    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  if (!allowedTypes[file.mimetype]) {
    return cb(new Error("Only JPG, PNG and WEBP images are allowed"), false);
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,

  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 2,
    fields: 10,
  },
});

const uploadFields = upload.fields([
  {
    name: "image",
    maxCount: 1,
  },
  {
    name: "icon",
    maxCount: 1,
  },
]);

exports.uploadMasterSport = (req, res, next) => {
  uploadFields(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        success: false,

        message:
          error.code === "LIMIT_FILE_SIZE"
            ? "Each file must not exceed 5 MB"
            : error.message || "File upload failed",
      });
    }

    next();
  });
};
