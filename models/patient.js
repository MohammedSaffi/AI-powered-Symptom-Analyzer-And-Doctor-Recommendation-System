import mongoose from "mongoose";

const patientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      // unique: true,
      sparse: true, // Allow multiple nulls
    },
    username: {
      type: String, // Enforce unique usernames // Each patient must have a username
    },
    age: {
      type: Number,
    },
    gender: {
      type: String,
    },
    phone: {
      type: String,
    },
    address: {
      type: String,
    },
    verified: {
      type: String,
      enum: ["google", "normal"],
      default: "normal",
    },
  },
  {
    timestamps: true, // This adds createdAt and updatedAt fields automatically
  },
);

console.log("Patient model created");

export const patient = mongoose.model("patient", patientSchema);
