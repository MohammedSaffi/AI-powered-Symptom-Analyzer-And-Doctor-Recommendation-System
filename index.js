import express from "express";
import mongoose from "mongoose";
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

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, "public");
  },
  filename: (req, file, callback) => {
    callback(null, file.originalname);
  },
});

const upload = multer({ storage: storage });

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(express.json());
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "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",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }, // 24 hours
  }),
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

// Doctor Register
app.post("/doctor", upload.single("idproof"), async (req, res) => {
  const { name, email, phone, gender } = req.body;
  // console.log(req.file.path);
  console.log(JSON.stringify(req.body));
  const file = req.file.path;

  try {
    const cloudinaryRes = await cloudinary.uploader.upload(file, {
      folder: "Rahul",
    });
    console.log(cloudinaryRes);

    const URL = cloudinaryRes.secure_url;
    const doctorid = generateCode();
    await doctor.create({
      name: name,
      email: email,
      phone: phone,
      gender: gender,
      idproof: URL,
      doctorid: doctorid,
    });
    res.redirect("/verifyDoctor");
  } catch (error) {
    console.error(error);
    res.status(500).send("⚠️ Error registering doctor");
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
