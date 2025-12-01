import { Router } from "express";
import { doctor } from "../models/doctor.js";
import { patient } from "../models/patient.js";
import { appointment } from "../models/appointment.js";
import { otp } from "../models/otp.js";
import {
  sendOTPEmail,
  verifyEmailConnection,
} from "../services/emailService.js";
import passport from "../services/googleAuth.js";
import { sendAppointmentConfirmationEmail } from "../services/emailService.js";

const patientRouter = Router();

patientRouter.get("/", async (req, res) => {
  const doctorArray = await doctor.find({ status: "approved" });

  // Get patient name from session or database
  let patientName = "Patient";
  if (req.session.patientId) {
    try {
      const patientDoc = await patient.findById(req.session.patientId);
      if (patientDoc && patientDoc.name) {
        patientName = patientDoc.name;
      } else if (req.session.patientName) {
        patientName = req.session.patientName;
      }
    } catch (error) {
      console.error("Error fetching patient:", error);
      if (req.session.patientName) {
        patientName = req.session.patientName;
      }
    }
  } else if (req.session.patientName) {
    patientName = req.session.patientName;
  }

  res.render("patient", {
    doctors: doctorArray,
    patientName: patientName,
  });
});

patientRouter.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] }),
);

patientRouter.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/patientPage" }),
  (req, res) => {
    // Set session for logged-in user
    req.session.patientEmail = req.user.email;
    req.session.patientId = req.user._id;
    req.session.patientName = req.user.name;
    res.locals.name = req.user.name;

    res.redirect("/patientPage");
  },
);

// Test email configuration endpoint (for debugging)
patientRouter.get("/test-email-config", async (req, res) => {
  try {
    const result = await verifyEmailConnection();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Generate random 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP to patient email
patientRouter.post("/send-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // Check if patient with this email already exists
    // Allow resending OTP if patient exists (for resend functionality)
    const existingPatient = await patient.findOne({ email });
    if (existingPatient && existingPatient.verified === "google") {
      return res.status(400).json({
        success: false,
        message:
          "Patient with this email already exists and is registered via Google. Please use Google login.",
      });
    }
    // If patient exists with normal verification, allow resending OTP

    // Generate OTP
    const otpCode = generateOTP();

    // Delete any existing OTPs for this email (including verified ones)
    await otp.deleteMany({ email });

    // Save new OTP
    await otp.create({
      email,
      otp: otpCode,
      verified: false,
    });

    console.log(`OTP generated for ${email}: ${otpCode}`); // Log for debugging (remove in production)

    // Send OTP via email
    const emailResult = await sendOTPEmail(email, otpCode);

    if (emailResult.success) {
      res.json({
        success: true,
        message:
          "OTP sent successfully to your email. Please check your inbox (and spam folder).",
      });
    } else {
      // Log detailed error on server side
      console.error("Email sending failed:", emailResult.error);
      console.error("Details:", emailResult.details);

      res.status(500).json({
        success: false,
        message:
          emailResult.error ||
          "Failed to send OTP. Please check your email configuration or try again later.",
        details:
          process.env.NODE_ENV === "development"
            ? emailResult.details
            : undefined,
      });
    }
  } catch (error) {
    console.error("Error sending OTP:", error);
    res.status(500).json({
      success: false,
      message: "Error sending OTP: " + error.message,
    });
  }
});

// Verify OTP and register patient
patientRouter.post("/verify-otp", async (req, res) => {
  try {
    const { email, otpCode } = req.body;

    if (!email || !otpCode) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    // Find OTP record
    const otpRecord = await otp.findOne({
      email,
      otp: otpCode,
      verified: false,
    });

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP. Please request a new OTP.",
      });
    }

    // Check if OTP is expired (10 minutes)
    const now = new Date();
    const otpAge = (now - otpRecord.createdAt) / 1000 / 60; // in minutes
    if (otpAge > 10) {
      await otp.deleteOne({ _id: otpRecord._id });
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new OTP.",
      });
    }

    // Mark OTP as verified
    otpRecord.verified = true;
    await otpRecord.save();

    // Check if patient already exists
    let patientDoc = await patient.findOne({ email });
    if (!patientDoc) {
      // Extract name from email (use part before @ as default name)
      const emailName = email.split("@")[0];
      const defaultName =
        emailName.charAt(0).toUpperCase() + emailName.slice(1);
      // Generate unique username
      const defaultUsername =
        email.split("@")[0] + Math.floor(Math.random() * 10000);

      // Create new patient with default name
      patientDoc = await patient.create({
        name: defaultName, // Use email username as default name
        email: email,
        username: defaultUsername,
        verified: "normal",
      });
    }

    // Set session
    req.session.patientEmail = email;
    req.session.patientId = patientDoc._id.toString();
    req.session.patientName = patientDoc.name;

    // Delete verified OTP
    await otp.deleteOne({ _id: otpRecord._id });

    res.json({
      success: true,
      message: "Email verified successfully! Redirecting to patient portal...",
      redirectUrl: "/patientPage",
      patientName: patientDoc.name,
    });
  } catch (error) {
    console.error("Error verifying OTP:", error);

    // Provide more specific error messages
    let errorMessage = "Error verifying OTP. Please try again.";
    if (error.message && error.message.includes("validation failed")) {
      errorMessage = "Registration failed. Please try requesting a new OTP.";
    } else if (error.message) {
      errorMessage = error.message;
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
});

patientRouter.get("/findNearDoctor", async (req, res) => {
  try {
    res.render("findNearDoctorForm");
  } catch (error) {
    console.error("Error finding doctors:", error);
    res.status(500).json({
      success: false,
      message: "Error finding doctors: " + error.message,
    });
  }
});

patientRouter.post("/book-appointment", async (req, res) => {
  try {
    const {
      doctorId,
      patientName,
      patientEmail,
      patientPhone,
      patientAge,
      patientGender,
      patientAddress,
      urgency,
      description,
    } = req.body;
    console.log(req.body);

    // Find or create patient by phone (primary identifier)
    let patientDoc = await patient.findOne({ phone: patientPhone });

    if (!patientDoc) {
      // Generate unique username
      const username = `patient${Date.now()}${Math.floor(Math.random() * 1000)}`;

      const patientData = {
        username: username,
        name: patientName,
        age: patientAge,
        gender: patientGender,
        phone: patientPhone,
        address: patientAddress,
      };

      // Only add email if provided and doesn't cause duplicate
      if (patientEmail) {
        // Check if email already exists in another patient record
        const existingPatientWithEmail = await patient.findOne({
          email: patientEmail,
        });
        if (!existingPatientWithEmail) {
          patientData.email = patientEmail;
        }
        // If email exists in another record, we just skip adding it to prevent duplicate error
        // The appointment will still be created with the email in the appointment record
      }

      patientDoc = await patient.create(patientData);
    } else {
      // Update patient info if exists - but don't update email if it would cause duplicate
      patientDoc.name = patientName;
      patientDoc.age = patientAge;
      patientDoc.gender = patientGender;
      patientDoc.address = patientAddress;

      // Only update email if it doesn't cause duplicate key error
      if (patientEmail && patientEmail !== patientDoc.email) {
        const existingPatientWithEmail = await patient.findOne({
          email: patientEmail,
        });
        if (!existingPatientWithEmail) {
          patientDoc.email = patientEmail;
        }
        // If email exists in another record, we skip updating to prevent duplicate error
      }

      await patientDoc.save();
    }

    // Create appointment - this allows multiple appointments with same email
    const newAppointment = await appointment.create({
      doctorid: doctorId,
      patientId: patientDoc._id,
      patientName: patientName,
      patientEmail: patientEmail || "",
      patientPhone: patientPhone,
      patientAge: patientAge,
      patientGender: patientGender,
      patientAddress: patientAddress,
      urgencyLevel: urgency || "low",
      description: description || "",
      status: "pending",
    });

    res.json({
      success: true,
      message:
        "Appointment booked successfully! The doctor will confirm your appointment soon.",
      appointmentId: newAppointment._id,
    });
  } catch (error) {
    console.error("Booking appointment error:", error);

    // Handle duplicate key error specifically
    if (error.code === 11000 && error.keyPattern && error.keyPattern.email) {
      return res.status(400).json({
        success: false,
        message:
          "This email is already registered with another patient. Please use a different email or contact support.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Error booking appointment: " + error.message,
    });
  }
});

patientRouter.get("/displayDoctors", async (req, res) => {
  const location = req.query.location.toLowerCase();
  const specialization = req.query.specialization.toLowerCase();
  console.log("Location:", location);
  console.log("Specialization:", specialization);

  console.log("Locals Data is ", res.locals);
  // Build query object
  const query = { status: "approved" };

  // Simple exact matching (case-sensitive)
  if (location && location !== "all") {
    query.location = location;
  }

  // Simple exact matching (case-sensitive)
  if (specialization && specialization !== "all") {
    query.specialization = specialization;
  }

  console.log("Query:", query);

  const doctorsArray = await doctor.find(query);
  console.log("Found doctors:", doctorsArray.length);

  res.render("patient", {
    doctors: doctorsArray,
    patientName: res.locals.name,
    // Hospital name is automatically included in each doctor object from the database
  });
});

export default patientRouter;
