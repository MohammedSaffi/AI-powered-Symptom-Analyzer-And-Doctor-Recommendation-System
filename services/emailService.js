import nodemailer from "nodemailer";

// Validate email configuration
const validateEmailConfig = () => {
  if (!process.env.EMAIL_USER) {
    return {
      valid: false,
      error: "EMAIL_USER is not set in environment variables",
    };
  }
  if (!process.env.EMAIL_PASS) {
    return {
      valid: false,
      error: "EMAIL_PASS is not set in environment variables",
    };
  }
  return { valid: true };
};

// Create transporter for sending emails
// For Gmail, you'll need to use App Password
const createTransporter = () => {
  const config = validateEmailConfig();
  if (!config.valid) {
    throw new Error(config.error);
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER, // Your Gmail address
      pass: process.env.EMAIL_PASS, // Your Gmail App Password
    },
  });
};

// Verify transporter connection
export const verifyEmailConnection = async () => {
  try {
    const config = validateEmailConfig();
    if (!config.valid) {
      return { success: false, error: config.error };
    }

    const transporter = createTransporter();
    await transporter.verify();
    return { success: true, message: "Email configuration is valid" };
  } catch (error) {
    console.error("Email verification error:", error);

    // Provide specific error messages
    if (error.code === "EAUTH") {
      return {
        success: false,
        error:
          "Authentication failed. Please check your EMAIL_USER and EMAIL_PASS. Make sure you're using a Gmail App Password, not your regular password.",
      };
    } else if (error.code === "ECONNECTION") {
      return {
        success: false,
        error: "Connection failed. Please check your internet connection.",
      };
    } else {
      return {
        success: false,
        error: error.message || "Failed to verify email configuration",
      };
    }
  }
};

// Send OTP email
export const sendOTPEmail = async (email, otp) => {
  try {
    // Validate configuration first
    const config = validateEmailConfig();
    if (!config.valid) {
      console.error("Email configuration error:", config.error);
      return { success: false, error: config.error };
    }

    const transporter = createTransporter();

    // Verify connection before sending
    await transporter.verify();
    console.log("Email server connection verified");

    const mailOptions = {
      from: `"Medicare" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Email Verification OTP - Medicare",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="color: #3B82F6; text-align: center; margin-bottom: 20px;">Email Verification</h2>
            <p style="color: #333333; font-size: 16px; line-height: 1.6;">
              Hello,
            </p>
            <p style="color: #333333; font-size: 16px; line-height: 1.6;">
              Thank you for registering with our Healthcare Portal. Please use the OTP below to verify your email address:
            </p>
            <div style="background-color: #3B82F6; color: #ffffff; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0;">
              <h1 style="margin: 0; font-size: 32px; letter-spacing: 5px;">${otp}</h1>
            </div>
            <p style="color: #666666; font-size: 14px; line-height: 1.6;">
              This OTP is valid for 10 minutes. If you didn't request this OTP, please ignore this email.
            </p>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
            <p style="color: #999999; font-size: 12px; text-align: center; margin: 0;">
              © ${new Date().getFullYear()} Healthcare Portal. All rights reserved.
            </p>
          </div>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("OTP email sent successfully:", info.messageId);
    console.log("Email sent to:", email);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending OTP email - Full error:", error);
    console.error("Error code:", error.code);
    console.error("Error response:", error.response);

    // Provide user-friendly error messages
    let errorMessage = "Failed to send OTP email.";

    if (error.code === "EAUTH") {
      errorMessage =
        "Email authentication failed. Please check your EMAIL_USER and EMAIL_PASS in .env file. Make sure you're using a Gmail App Password.";
    } else if (error.code === "ECONNECTION" || error.code === "ETIMEDOUT") {
      errorMessage =
        "Connection error. Please check your internet connection and try again.";
    } else if (error.responseCode === 535) {
      errorMessage =
        "Authentication failed. Please verify your Gmail App Password is correct.";
    } else if (error.message) {
      errorMessage = error.message;
    }

    return { success: false, error: errorMessage, details: error.message };
  }
};

// Send Appointment Confirmation Email - UPDATED TO INCLUDE HOSPITAL NAME
export const sendAppointmentConfirmationEmail = async (
  appointmentData,
  doctorDetails,
) => {
  try {
    // Validate configuration first
    const config = validateEmailConfig();
    if (!config.valid) {
      console.error("Email configuration error:", config.error);
      return { success: false, error: config.error };
    }

    const transporter = createTransporter();

    // Verify connection before sending
    await transporter.verify();
    console.log(
      "Email server connection verified for appointment confirmation",
    );

    const {
      patientName,
      patientEmail,
      timeSlot,
      appointmentDate,
      confirmationMessage,
      description,
    } = appointmentData;

    if (!patientEmail) {
      return { success: false, error: "Patient email not found" };
    }

    const formattedDate = new Date(appointmentDate).toLocaleDateString(
      "en-US",
      {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      },
    );

    const mailOptions = {
      from: `"MediCare Hub" <${process.env.EMAIL_USER}>`,
      to: patientEmail,
      subject: `Appointment Confirmed - ${formattedDate}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 28px;">Appointment Confirmed! 🎉</h1>
            <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Your healthcare appointment has been scheduled</p>
          </div>
          
          <div style="background-color: #ffffff; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="color: #333333; margin-bottom: 20px;">Dear ${patientName},</h2>
            <p style="color: #333333; font-size: 16px; line-height: 1.6;">
              We're pleased to inform you that your appointment has been confirmed. Here are your appointment details:
            </p>
            
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea;">
              <h3 style="color: #333333; margin-top: 0;">Appointment Details</h3>
              <p style="color: #333333; margin: 8px 0;"><strong>Date:</strong> ${formattedDate}</p>
              <p style="color: #333333; margin: 8px 0;"><strong>Time Slot:</strong> ${timeSlot}</p>
              ${doctorDetails ? `<p style="color: #333333; margin: 8px 0;"><strong>Doctor:</strong> Dr. ${doctorDetails.name}</p>` : ""}
              ${doctorDetails && doctorDetails.specialization ? `<p style="color: #333333; margin: 8px 0;"><strong>Specialization:</strong> ${doctorDetails.specialization}</p>` : ""}
              ${doctorDetails && doctorDetails.hospitalName ? `<p style="color: #333333; margin: 8px 0;"><strong>Hospital/Clinic:</strong> ${doctorDetails.hospitalName}</p>` : ""}
              ${confirmationMessage ? `<p style="color: #333333; margin: 8px 0;"><strong>Doctor's Note:</strong> ${confirmationMessage}</p>` : ""}
              ${description ? `<p style="color: #333333; margin: 8px 0;"><strong>Your Concern:</strong> ${description}</p>` : ""}
            </div>

            <h3 style="color: #333333; margin-bottom: 15px;">Important Reminders:</h3>
            <ul style="color: #333333; padding-left: 20px; margin-bottom: 20px;">
              <li style="margin-bottom: 8px;">Please arrive 15 minutes before your scheduled time</li>
              <li style="margin-bottom: 8px;">Bring any relevant medical reports or documents</li>
              <li style="margin-bottom: 8px;">Carry your ID proof and insurance details if applicable</li>
              <li style="margin-bottom: 8px;">In case of emergency, contact the hospital directly</li>
            </ul>

            <p style="color: #333333; font-size: 16px; line-height: 1.6;">
              If you need to reschedule or cancel your appointment, please contact us at least 24 hours in advance.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="#" style="display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                Add to Calendar
              </a>
            </div>
          </div>
          
          <div style="text-align: center; margin-top: 20px; padding: 20px; color: #666; font-size: 12px;">
            <p>Thank you for choosing MediCare Hub for your healthcare needs.</p>
            <p>If you have any questions, please contact our support team.</p>
            <p>© ${new Date().getFullYear()} MediCare Hub. All rights reserved.</p>
          </div>
        </div>
      `,
      // Text version for email clients that don't support HTML - UPDATED TO INCLUDE HOSPITAL NAME
      text: `
Appointment Confirmed

Dear ${patientName},

Your appointment has been confirmed with the following details:

Date: ${formattedDate}
Time: ${timeSlot}
${doctorDetails ? `Doctor: Dr. ${doctorDetails.name}` : ""}
${doctorDetails && doctorDetails.specialization ? `Specialization: ${doctorDetails.specialization}` : ""}
${doctorDetails && doctorDetails.hospitalName ? `Hospital/Clinic: ${doctorDetails.hospitalName}` : ""}
${confirmationMessage ? `Doctor's Note: ${confirmationMessage}` : ""}
${description ? `Your Concern: ${description}` : ""}

Important Reminders:
- Please arrive 15 minutes before your scheduled time
- Bring any relevant medical reports or documents
- Carry your ID proof and insurance details if applicable
- In case of emergency, contact the hospital directly

If you need to reschedule or cancel, please contact us at least 24 hours in advance.

Thank you for choosing MediCare Hub.

© ${new Date().getFullYear()} MediCare Hub. All rights reserved.
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(
      "Appointment confirmation email sent successfully:",
      info.messageId,
    );
    console.log("Appointment confirmation sent to:", patientEmail);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(
      "Error sending appointment confirmation email - Full error:",
      error,
    );
    console.error("Error code:", error.code);

    let errorMessage = "Failed to send appointment confirmation email.";

    if (error.code === "EAUTH") {
      errorMessage =
        "Email authentication failed. Please check your email configuration.";
    } else if (error.code === "ECONNECTION" || error.code === "ETIMEDOUT") {
      errorMessage = "Connection error. Please check your internet connection.";
    } else if (error.message) {
      errorMessage = error.message;
    }

    return { success: false, error: errorMessage, details: error.message };
  }
};
