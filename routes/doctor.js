import { Router } from "express";
import bcrypt from "bcryptjs";
import { doctor as DoctorModel } from "../models/doctor.js";
import { appointment } from "../models/appointment.js";
import generateCode from "../services/uniqueID.js";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { sendAppointmentConfirmationEmail } from '../services/emailService.js';

const doctorRouter = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, "public");
  },
  filename: (req, file, callback) => {
    callback(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage: storage });

// Middleware to check if doctor is logged in
const isDoctorLoggedIn = (req, res, next) => {
  if (req.session && req.session.doctorId) {
    return next();
  }
  res.redirect("/doctorLogin");
};

// Doctor Registration - UPDATED TO INCLUDE HOSPITAL NAME
doctorRouter.post("/register", async (req, res) => {
  try {
    const { name, email, password, phone, gender, specialization, location, hospitalName } = req.body;

    // Check if doctor already exists
    const existingDoctor = await DoctorModel.findOne({ email });
    if (existingDoctor) {
      return res.status(400).json({ 
        success: false, 
        message: "Doctor with this email already exists" 
      });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Generate unique doctor ID
    const doctorid = generateCode();

    // Create doctor - INCLUDING HOSPITAL NAME
    const newDoctor = await DoctorModel.create({
      name,
      email,
      passwordHash,
      phone,
      gender,
      specialization: specialization.toLowerCase(),
      location: location.toLowerCase(),
      hospitalName: hospitalName || '', // Add hospital name field
      doctorid,
      status: "pending",
    });

    res.status(201).json({
      success: true,
      message: "Doctor registered successfully! Please wait for admin approval.",
      doctorId: doctorid,
    });
  } catch (error) {
    console.error("Doctor registration error:", error);
    res.status(500).json({
      success: false,
      message: "Error registering doctor: " + error.message,
    });
  }
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
        message: "Your account is pending approval. Please wait for admin approval.",
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, foundDoctor.passwordHash);
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
    const foundDoctor = await DoctorModel.findOne({ doctorid: doctorId }).select("-passwordHash");
    
    if (!foundDoctor) {
      return res.status(404).json({ success: false, message: "Doctor not found" });
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
      { new: true }
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
doctorRouter.post("/profile/picture", isDoctorLoggedIn, upload.single("profilePicture"), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    // Upload to Cloudinary
    const cloudinaryRes = await cloudinary.uploader.upload(req.file.path, {
      folder: "doctor-profiles",
    });

    // Update doctor profile picture
    const updatedDoctor = await DoctorModel.findOneAndUpdate(
      { doctorid: doctorId },
      { profilePicture: cloudinaryRes.secure_url },
      { new: true }
    ).select("-passwordHash");

    res.json({
      success: true,
      message: "Profile picture uploaded successfully",
      profilePicture: cloudinaryRes.secure_url,
      doctor: updatedDoctor,
    });
  } catch (error) {
    console.error("Profile picture upload error:", error);
    res.status(500).json({
      success: false,
      message: "Error uploading profile picture: " + error.message,
    });
  }
});

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
    res.status(500).json({ success: false, message: "Error fetching appointments" });
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
doctorRouter.post("/appointments/:appointmentId/confirm", isDoctorLoggedIn, async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { timeSlot, appointmentDate, confirmationMessage } = req.body;
    const doctorId = req.session.doctorId;
    console.log("The doctor is in appoints route " , doctorId);
    console.log("Confirming appointment:", appointmentId, timeSlot, appointmentDate);

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
    foundAppointment.confirmationMessage = confirmationMessage || 
      `Your appointment has been confirmed for ${timeSlot} on ${new Date(appointmentDate).toLocaleDateString()}`;
    
    await foundAppointment.save();

    // Send email notification to patient
    try {
      // Get doctor details for the email
      const doctorDetails = await getDoctorById(doctorId);
      
      console.log("Doctor details:", doctorDetails);
      
      const emailResult = await sendAppointmentConfirmationEmail(foundAppointment, doctorDetails);
      
      if (emailResult.success) {
        console.log("Appointment confirmation email sent successfully to:", foundAppointment.patientEmail);
      } else {
        console.error("Failed to send appointment confirmation email:", emailResult.error);
        // Don't fail the whole request if email fails, just log it
      }
    } catch (emailError) {
      console.error("Error in email sending process:", emailError);
      // Continue with the response even if email fails
    }

    res.json({
      success: true,
      message: "Appointment confirmed successfully. Patient will be notified.",
      appointment: foundAppointment,
      emailSent: true
    });
  } catch (error) {
    console.error("Appointment confirmation error:", error);
    res.status(500).json({
      success: false,
      message: "Error confirming appointment: " + error.message,
    });
  }
});

// Logout
doctorRouter.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: "Error logging out" });
    }
    res.json({ success: true, message: "Logged out successfully" });
  });
});

export default doctorRouter;