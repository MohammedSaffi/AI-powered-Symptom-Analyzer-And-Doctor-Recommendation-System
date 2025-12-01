import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
// import {createTokenForUser} from "../services/authentication.js"
// import jwt from 'jsonwebtoken'
import { patient } from "../models/patient.js";
import { config } from "dotenv";
config();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      callbackURL: process.env.CALL_BACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      console.log(profile);
      // console.log(profile["emails"].value);
      try {
        let google_email = profile.emails[0].value;
        let patientDoc = await patient.findOne({ email: google_email });
        if (!patientDoc) {
          patientDoc = await patient.create({
            name: profile.displayName,
            email: google_email,
            verified: "google",
          });
        } else {
          // Update verified status if not already set
          if (patientDoc.verified !== "google") {
            patientDoc.verified = "google";
            await patientDoc.save();
          }
        }

        // Store patient info in the request for session management
        const user = {
          id: patientDoc._id.toString(),
          email: patientDoc.email,
          name: patientDoc.name || profile.displayName,
        };

        return done(null, user);
      } catch (e) {
        return done(e, null);
      }
    },
  ),
);

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user);
});

// Deserialize user from session
passport.deserializeUser((user, done) => {
  done(null, user);
});

export default passport;
