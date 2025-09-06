import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import env from "dotenv";

const app = express();
const port = 3000;
const saltRounds = 10;
let user_email;

app.use(bodyParser.urlencoded({ extended: true }));

app.use(
  session({
    secret: "TOPSECRETWORD",
    resave: false,
    saveUninitialized: true,
    rolling: true,
    cookie: {
      maxAge: 10 * 60 * 1000,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.use(express.static("public"));
env.config();

const db = new pg.Client({
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
  user: process.env.PG_USER,
});
db.connect();

// ---------------------
// PASSPORT SERIALIZATION
// ---------------------
passport.serializeUser((user, done) => {
  done(null, user.email);
});

passport.deserializeUser(async (email, done) => {
  try {
    const result = await db.query("SELECT * FROM identity WHERE email=$1", [
      email,
    ]);
    done(null, result.rows[0]);
  } catch (err) {
    done(err, null);
  }
});

// ---------------------
// LOCAL STRATEGY (Your existing JWT-like login)
// ---------------------
passport.use(
  new LocalStrategy(
    { usernameField: "email", passwordField: "password" },
    async (email, password, done) => {
      try {
        const result = await db.query(
          "SELECT * FROM identity WHERE email=$1",
          [email]
        );
        if (result.rows.length === 0) {
          return done(null, false, { message: "User not found" });
        }
        const user = result.rows[0];
        bcrypt.compare(password, user.password, (err, valid) => {
          if (err) return done(err);
          if (!valid) return done(null, false, { message: "Wrong password" });
          return done(null, user);
        });
      } catch (err) {
        return done(err);
      }
    }
  )
);

// ---------------------
// GOOGLE STRATEGY
// ---------------------
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:3000/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;

        // Check if user exists
        const result = await db.query(
          "SELECT * FROM identity WHERE email=$1",
          [email]
        );

        if (result.rows.length === 0) {
          // Register new Google user
          await db.query("INSERT INTO identity(email, password) VALUES($1,$2)", [
            email,
            null, // password not required for Google users
          ]);
        }

        return done(null, { email: email });
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

// ---------------------
// ROUTES
// ---------------------
app.get("/", (req, res) => {
  if (req.session.email) {
    res.redirect("/index");
  } else {
    user_email = "";
    res.render("home.ejs");
  }
});

app.get("/login", (req, res) => {
  user_email = "";
  res.render("login.ejs");
});
app.get("/register", (req, res) => {
  user_email = "";
  res.render("register.ejs");
});

// Local login
app.post(
  "/login",
  passport.authenticate("local", {
    failureRedirect: "/login",
  }),
  async (req, res) => {
    req.session.email = req.user.email;
    const dat = await db.query("SELECT * FROM expense WHERE email=$1", [
      req.user.email,
    ]);
    res.render("index.ejs", { data: dat.rows });
  }
);

// Google login
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  async (req, res) => {
    req.session.email = req.user.email;
    const dat = await db.query("SELECT * FROM expense WHERE email=$1", [
      req.user.email,
    ]);
    res.render("index.ejs", { data: dat.rows });
  }
);

// Register
app.post("/register", async (req, res) => {
  const email = req.body["email"];
  const password = req.body["password"];
  try {
    const prev = await db.query("SELECT * FROM identity WHERE email=$1", [
      email,
    ]);
    if (prev.rows.length > 0) {
      res.redirect("/login");
    }
    bcrypt.hash(password, saltRounds, async (err, hashed_password) => {
      if (err) {
        console.log("Fatal error while binding the password.");
        res.redirect("/");
      }
      await db.query(
        "INSERT INTO identity(email,password) VALUES($1,$2)",
        [email, hashed_password]
      );
      req.session.email = email;
      res.render("index.ejs");
    });
  } catch (error) {
    console.log(error);
    res.redirect("/");
  }
});

// ---------------------
// Your existing /index and /summary routes remain unchanged
// ---------------------

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
