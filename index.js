import express from "express";
import mongoose from "mongoose";
import MongoStore from "connect-mongo";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import session from "express-session";
import passport from "passport";
import path from "path";
import { fileURLToPath } from "url";
import { adminRouter } from "./routes/admin.js";
import { admin } from "./models/admin.js";
import { doctor } from "./models/doctor.js";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import doctorRouter from "./routes/doctor.js";
import generateCode from "./services/uniqueID.js";
import patientRouter from "./routes/patient.js";
import { mediAI } from "./routes/cerebras.js";
import "./services/googleAuth.js"; // Initialize passport strategies
dotenv.config();
// Database connection
try {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ MongoDB connected successfully!");
} catch (err) {
  console.error("❌ MongoDB connection failed:", err);
}
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET, // Click 'View API Keys' above to copy your API secret
});

const app = express();
const PORT = process.env.PORT || 5000;

// Fix __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Remove the diskStorage and use memoryStorage instead
// const storage = multer.diskStorage({  // ← REMOVE THIS
//   destination: (req, file, callback) => {
//     callback(null, "public");
//   },
//   filename: (req, file, callback) => {
//     callback(null, file.originalname);
//   },
// });

// Use memory storage (no local files)
const storage = multer.memoryStorage();

const upload = multer({ storage: storage });

// Middleware
app.use(express.urlencoded({ extended: true }));
// Remove or keep this static only for other assets (not for uploads)
app.use(express.static("public"));
app.use(express.json());
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "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",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: "sessions",
    }),
    cookie: {
      secure: false, // set true only if using https
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());
app.set("view engine", "ejs");

app.use((req, res, next) => {
  if (req.session.patientName) {
    res.locals.name = req.session.patientName;
    res.locals.doctorid = req.session.doctorId;
  }

  next();
});

// Routes
app.get("/", (req, res) => {
  console.log("Home Page");
  res.render("index");
});

// Admin Login
app.post("/admin", async (req, res) => {
  console.log("The admin details are", req.body);
  const { email, password } = req.body;
  const response = await admin.find();
  console.log(response);
  try {
    if (email == "admin@gmail.com" && password == "asdf") {
      res
        .cookie("admin", JSON.stringify(email, password))
        .redirect("/adminPage");
    } else {
      res.json({ status: 400, valid: "Invalid Email!" });
    }
    // const isMatch = await bcrypt.compare(password, admin.password);
    // if (!isMatch) return res.status(401).send("❌ Invalid credentials");
  } catch (error) {
    console.error(error);
    res.status(500).send("⚠️ Server error during admin login");
  }
});

// Doctor Register - UPDATED TO UPLOAD DIRECTLY TO CLOUDINARY
app.post("/doctor", upload.single("idproof"), async (req, res) => {
  const { name, email, phone, gender } = req.body;
  console.log("Doctor registration data:", JSON.stringify(req.body));
  
  // Check if file was uploaded
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "ID proof file is required"
    });
  }

  try {
    // Upload directly to Cloudinary from buffer (no local file)
    const cloudinaryRes = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: "doctor-idproofs",
          public_id: `idproof_${Date.now()}_${email}`,
          resource_type: 'auto',
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        }
      );
      
      // Pipe the buffer to Cloudinary
      uploadStream.end(req.file.buffer);
    });

    console.log("Cloudinary upload successful:", cloudinaryRes.secure_url);

    const doctorid = generateCode();
    
    // Create doctor with Cloudinary URL
    await doctor.create({
      name: name,
      email: email,
      phone: phone,
      gender: gender,
      idproof: cloudinaryRes.secure_url, // Store Cloudinary URL
      doctorid: doctorid,
      idproofPublicId: cloudinaryRes.public_id, // Optional: store public_id for future management
    });
    
    res.redirect("/verifyDoctor");
  } catch (error) {
    console.error("Error in doctor registration:", error);
    
    // Provide user-friendly error message
    let errorMessage = "Error registering doctor";
    if (error.message && error.message.includes("E11000")) {
      errorMessage = "Doctor with this email already exists";
    }
    
    res.status(500).json({
      success: false,
      message: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Patient Verify
app.get("/patientVerify", async (req, res) => {
  const { aadhar, phone } = req.query;
  try {
    res.redirect("/patientPage");
  } catch (error) {
    console.error(error);
    res.status(500).send("⚠️ Error verifying patient");
  }
});

app.post("/sendAppointment", (req, res) => {
  // alert("");
  res.send("Appointment booked successfully");
});

app.use("/patientPage", patientRouter);

app.use("/adminPage", adminRouter);

app.use("/verifyDoctor", doctorRouter);

// Doctor login page (before /doctor routes to avoid conflict)
app.get("/doctorLogin", (req, res) => {
  res.render("doctorLogin");
});

// Doctor routes
app.use("/doctor", doctorRouter);

app.use("/mediAI", mediAI);

// Server listen
app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`),
);