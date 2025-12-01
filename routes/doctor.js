import { Router } from "express";
import bcrypt from "bcryptjs";
import { doctor as DoctorModel } from "../models/doctor.js";
import { appointment } from "../models/appointment.js";
import generateCode from "../services/uniqueID.js";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { sendAppointmentConfirmationEmail } from "../services/emailService.js";
import fs from "fs";
import path from "path";

const doctorRouter = Router();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure multer for file uploads (temporary storage)
const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    const uploadDir = "uploads/";
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    callback(null, uploadDir);
  },
  filename: (req, file, callback) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    callback(null, uniqueSuffix + "-" + file.originalname);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only PDF and image files
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Only PDF, JPG, and PNG files are allowed.",
        ),
      );
    }
  },
});

// Middleware to check if doctor is logged in
const isDoctorLoggedIn = (req, res, next) => {
  if (req.session && req.session.doctorId) {
    return next();
  }
  res.redirect("/doctorLogin");
};

// Doctor Registration - UPDATED TO HANDLE FILE UPLOAD
doctorRouter.post(
  "/register",
  upload.single("medicalLicense"),
  async (req, res) => {
    try {
      const {
        name,
        email,
        password,
        phone,
        gender,
        specialization,
        location,
        hospitalName,
      } = req.body;

      // Check if medical license file was uploaded
      if (!req.file) {
        // Clean up if there's an uploaded file
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({
          success: false,
          message: "Medical license file is required",
        });
      }

      // Check if doctor already exists
      const existingDoctor = await DoctorModel.findOne({ email });
      if (existingDoctor) {
        // Clean up uploaded file
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({
          success: false,
          message: "Doctor with this email already exists",
        });
      }

      try {
        // Upload medical license to Cloudinary
        const cloudinaryResult = await cloudinary.uploader.upload(
          req.file.path,
          {
            folder: "doctor-licenses",
            resource_type: "auto", // Auto-detect resource type (image or raw for PDF)
            public_id: `license_${Date.now()}_${email}`,
            transformation: [{ quality: "auto" }, { format: "auto" }],
          },
        );

        // Hash password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Generate unique doctor ID
        const doctorid = generateCode();

        // Create doctor with Cloudinary URL
        const newDoctor = await DoctorModel.create({
          name,
          email,
          passwordHash,
          phone,
          gender,
          specialization: specialization.toLowerCase(),
          location: location.toLowerCase(),
          hospitalName: hospitalName || "",
          doctorid,
          status: "pending",
          medicalLicenseUrl: cloudinaryResult.secure_url, // Store Cloudinary URL
          medicalLicensePublicId: cloudinaryResult.public_id, // Store public_id for future management
          licenseUploadedAt: new Date(),
        });

        // Clean up the temporary file
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }

        res.status(201).json({
          success: true,
          message:
            "Doctor registered successfully! Please wait for admin approval.",
          doctorId: doctorid,
          medicalLicenseUrl: cloudinaryResult.secure_url,
        });
      } catch (cloudinaryError) {
        // Clean up temporary file if Cloudinary upload fails
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        console.error("Cloudinary upload error:", cloudinaryError);
        return res.status(500).json({
          success: false,
          message: "Error uploading medical license. Please try again.",
          details: cloudinaryError.message,
        });
      }
    } catch (error) {
      // Clean up temporary file if any error occurs
      if (req.file && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkError) {
          console.error("Error cleaning up file:", unlinkError);
        }
      }

      console.error("Doctor registration error:", error);
      res.status(500).json({
        success: false,
        message: "Error registering doctor: " + error.message,
      });
    }
  },
);

// Error handling middleware for multer
doctorRouter.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File size is too large. Maximum size is 5MB.",
      });
    }
    return res.status(400).json({
      success: false,
      message: "File upload error: " + error.message,
    });
  } else if (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
  next();
});

// Doctor Login
doctorRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find doctor by email
    const foundDoctor = await DoctorModel.findOne({ email });
    if (!foundDoctor) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check if doctor is approved
    if (foundDoctor.status !== "approved") {
      return res.status(403).json({
        success: false,
        message:
          "Your account is pending approval. Please wait for admin approval.",
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(
      password,
      foundDoctor.passwordHash,
    );
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Set session
    req.session.doctorId = foundDoctor.doctorid;
    req.session.doctorEmail = foundDoctor.email;

    res.json({
      success: true,
      message: "Login successful",
      doctorId: foundDoctor.doctorid,
      redirectUrl: "/doctor/dashboard",
    });
  } catch (error) {
    console.error("Doctor login error:", error);
    res.status(500).json({
      success: false,
      message: "Error during login: " + error.message,
    });
  }
});

// Doctor Dashboard
doctorRouter.get("/dashboard", isDoctorLoggedIn, async (req, res) => {
  try {
    const doctorId = req.session.doctorId;

    const foundDoctor = await DoctorModel.findOne({ doctorid: doctorId });

    if (!foundDoctor) {
      return res.redirect("/doctorLogin");
    }

    // Get all appointments for this doctor
    const appointments = await appointment
      .find({ doctorid: doctorId })
      .sort({ createdAt: -1 });

    res.render("doctorDashboard", {
      doctor: foundDoctor,
      appointments: appointments,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).send("Error loading dashboard: " + error.message);
  }
});

// Get Doctor Profile (API endpoint)
doctorRouter.get("/profile", isDoctorLoggedIn, async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const foundDoctor = await DoctorModel.findOne({
      doctorid: doctorId,
    }).select("-passwordHash");

    if (!foundDoctor) {
      return res
        .status(404)
        .json({ success: false, message: "Doctor not found" });
    }

    res.json({ success: true, doctor: foundDoctor });
  } catch (error) {
    console.error("Profile fetch error:", error);
    res.status(500).json({ success: false, message: "Error fetching profile" });
  }
});

// Update Doctor Profile - UPDATED TO INCLUDE HOSPITAL NAME
doctorRouter.post("/profile/update", isDoctorLoggedIn, async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const { name, phone, specialization, location, hospitalName } = req.body;

    const updatedDoctor = await DoctorModel.findOneAndUpdate(
      { doctorid: doctorId },
      { name, phone, specialization, location, hospitalName }, // Include hospital name
      { new: true },
    ).select("-passwordHash");

    res.json({
      success: true,
      message: "Profile updated successfully",
      doctor: updatedDoctor,
    });
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating profile: " + error.message,
    });
  }
});

// Upload Profile Picture
doctorRouter.post(
  "/profile/picture",
  isDoctorLoggedIn,
  upload.single("profilePicture"),
  async (req, res) => {
    try {
      const doctorId = req.session.doctorId;

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded",
        });
      }

      try {
        // Upload to Cloudinary
        const cloudinaryRes = await cloudinary.uploader.upload(req.file.path, {
          folder: "doctor-profiles",
        });

        // Update doctor profile picture
        const updatedDoctor = await DoctorModel.findOneAndUpdate(
          { doctorid: doctorId },
          {
            profilePicture: cloudinaryRes.secure_url,
            profilePicturePublicId: cloudinaryRes.public_id,
          },
          { new: true },
        ).select("-passwordHash");

        // Clean up temporary file
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }

        res.json({
          success: true,
          message: "Profile picture uploaded successfully",
          profilePicture: cloudinaryRes.secure_url,
          doctor: updatedDoctor,
        });
      } catch (cloudinaryError) {
        // Clean up temporary file
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        console.error("Cloudinary upload error:", cloudinaryError);
        throw cloudinaryError;
      }
    } catch (error) {
      console.error("Profile picture upload error:", error);
      res.status(500).json({
        success: false,
        message: "Error uploading profile picture: " + error.message,
      });
    }
  },
);

// Get Appointments
doctorRouter.get("/appointments", isDoctorLoggedIn, async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const appointments = await appointment
      .find({ doctorid: doctorId })
      .sort({ createdAt: -1 });

    res.json({ success: true, appointments });
  } catch (error) {
    console.error("Appointments fetch error:", error);
    res
      .status(500)
      .json({ success: false, message: "Error fetching appointments" });
  }
});

// Helper function to get doctor details
async function getDoctorById(doctorId) {
  try {
    console.log("Fetching doctor details for:", doctorId);

    const doctorData = await DoctorModel.findOne({ doctorid: doctorId });

    if (!doctorData) {
      console.log("No doctor found with ID:", doctorId);
      return null;
    }

    console.log("Doctor found:", doctorData.name);
    return doctorData;
  } catch (error) {
    console.error("Error fetching doctor details:", error);
    return null;
  }
}

// Confirm Appointment
doctorRouter.post(
  "/appointments/:appointmentId/confirm",
  isDoctorLoggedIn,
  async (req, res) => {
    try {
      const { appointmentId } = req.params;
      const { timeSlot, appointmentDate, confirmationMessage } = req.body;
      const doctorId = req.session.doctorId;
      console.log("The doctor is in appoints route ", doctorId);
      console.log(
        "Confirming appointment:",
        appointmentId,
        timeSlot,
        appointmentDate,
      );

      // Find appointment and verify it belongs to this doctor
      const foundAppointment = await appointment.findOne({
        _id: appointmentId,
        doctorid: doctorId,
      });

      if (!foundAppointment) {
        return res.status(404).json({
          success: false,
          message: "Appointment not found",
        });
      }

      // Update appointment status
      foundAppointment.status = "confirmed";
      foundAppointment.timeSlot = timeSlot;
      foundAppointment.appointmentDate = appointmentDate;
      foundAppointment.confirmationMessage =
        confirmationMessage ||
        `Your appointment has been confirmed for ${timeSlot} on ${new Date(appointmentDate).toLocaleDateString()}`;

      await foundAppointment.save();

      // Send email notification to patient
      try {
        // Get doctor details for the email
        const doctorDetails = await getDoctorById(doctorId);

        console.log("Doctor details:", doctorDetails);

        const emailResult = await sendAppointmentConfirmationEmail(
          foundAppointment,
          doctorDetails,
        );

        if (emailResult.success) {
          console.log(
            "Appointment confirmation email sent successfully to:",
            foundAppointment.patientEmail,
          );
        } else {
          console.error(
            "Failed to send appointment confirmation email:",
            emailResult.error,
          );
          // Don't fail the whole request if email fails, just log it
        }
      } catch (emailError) {
        console.error("Error in email sending process:", emailError);
        // Continue with the response even if email fails
      }

      res.json({
        success: true,
        message:
          "Appointment confirmed successfully. Patient will be notified.",
        appointment: foundAppointment,
        emailSent: true,
      });
    } catch (error) {
      console.error("Appointment confirmation error:", error);
      res.status(500).json({
        success: false,
        message: "Error confirming appointment: " + error.message,
      });
    }
  },
);

// Logout
doctorRouter.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res
        .status(500)
        .json({ success: false, message: "Error logging out" });
    }
    res.json({ success: true, message: "Logged out successfully" });
  });
});

export default doctorRouter;
