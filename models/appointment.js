import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema({
    doctorid: {
        type: String,
        required: true,
    },
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'patient',
        required: true,
    },
    patientName: {
        type: String,
        required: true,
    },
    patientEmail: {
        type: String,
        sparse: true,
    },
    patientPhone: {
        type: String,
        required: true,
    },
    patientAge: {
        type: Number,
    },
    patientGender: {
        type: String,
    },
    patientAddress: {
        type: String,
    },
    urgencyLevel: {
        type: String,
        enum: ["low", "medium", "high"],
        default: "low",
    },
    description: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        enum: ["pending", "confirmed", "cancelled", "completed"],
        default: "pending",
    },
    timeSlot: {
        type: String,
        default: null,
    },
    appointmentDate: {
        type: Date,
        default: null,
    },
    confirmationMessage: {
        type: String,
        default: null,
    },
    hospitalName: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
})

export const appointment = mongoose.model("appointment", appointmentSchema);