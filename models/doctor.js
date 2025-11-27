import mongoose from "mongoose";

const doctorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
  },
  gender: {
    type: String,
  },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  idproof: {
    type: String,
  },
  profilePicture: {
    type: String,
    default: null,
  },
  doctorid: {
    type: String,
    default: null,
    unique: true,
  },
  specialization: {
    type: String,
  },
  location: {
    type: String,
  },
  hospitalName: {
    type: String,
    default: ''
  }
});

console.log("Database created");


export const doctor = mongoose.model("doctor", doctorSchema);