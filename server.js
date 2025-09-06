import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20"; // NEW
import env from "dotenv";

const app = express();
const port = 3000;
const saltRounds = 10;
let user_email;

env.config();

app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: "TOPSECRETWORD",
  resave: false,
  saveUninitialized: true,
  rolling: true,
  cookie: { maxAge: 10 * 60 * 1000 }
}));

app.use(express.static("public"));
app.set("view engine", "ejs");

// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

// Database
const db = new pg.Client({
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
  user: process.env.PG_USER,
});
db.connect();

// =============================
// Passport Google Strategy
// =============================
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails[0].value;

      // Check if user exists in DB
      const prev = await db.query("SELECT * FROM identity WHERE email=$1", [email]);

      if (prev.rows.length === 0) {
        // If new user, insert with dummy password
        await db.query("INSERT INTO identity(email, password) VALUES($1, $2)", [email, "google-oauth"]);
      }

      return done(null, { email });
    } catch (err) {
      return done(err, null);
    }
  }
));

// Passport serialization
passport.serializeUser((user, done) => {
  done(null, user.email);
});

passport.deserializeUser(async (email, done) => {
  try {
    const result = await db.query("SELECT * FROM identity WHERE email=$1", [email]);
    done(null, result.rows[0]);
  } catch (err) {
    done(err, null);
  }
});

// =============================
// Google OAuth Routes
// =============================
app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

app.get("/auth/google/callback", 
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => {
    req.session.email = req.user.email; // Store in session
    res.redirect("/index");
  }
);

// =============================
// Your Existing Routes (unchanged)
// =============================

app.get("/", (req, res) => {
  if (req.session.email) {
    res.redirect("/index");
  } else {
    user_email = "";
    res.render("home.ejs");
  }
});

// keep your /login, /register, /index, /summary as they are...

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
