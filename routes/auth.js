const express = require("express");
const passport = require("passport");
const jwt = require("jsonwebtoken");
const UserModel = require("../models/User");

const router = express.Router();

const jwtSign = (body) => {
  return jwt.sign({ user: body }, "TOP_SECRET");
};

router.post(
  "/signup",
  passport.authenticate("signup", { session: false }),
  async (req, res, next) => {
    const token = jwtSign({ _id: req.user._id, email: req.user.email });

    res.status(200).json({
      token,
      email: req.user.email,
      name: req.user.name,
      avatar: req.user.avatar,
    });
  }
);

router.post("/google", async (req, res, next) => {
  const { name, email, avatar } = req.body;
  try {
    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      const token = jwtSign({
        _id: existingUser._id,
        email: existingUser.email,
      });
      res.status(200).json({
        token,
        email: existingUser.email,
        name: existingUser.name,
        avatar: existingUser.avatar,
      });
    } else {
      const user = new UserModel({ name, email, avatar });

      const newUser = await user.save();
      const newToken = jwtSign({ _id: newUser._id, email: newUser.email });

      res.status(201).json({
        token: newToken,
        email: newUser.email,
        name: newUser.name,
        avatar: newUser.avatar,
      });
    }
  } catch (error) {
    return next(error);
  }
});

router.post("/login", async (req, res, next) => {
  passport.authenticate("login", async (err, user, info) => {
    try {
      if (err || !user) {
        const error = { message: info.message };

        return next(error);
      }

      req.login(user, { session: false }, async (error) => {
        if (error) return next(error);

        const token = jwtSign({ _id: user._id, email: user.email });

        return res.status(200).json({
          token,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
        });
      });
    } catch (error) {
      return next(error);
    }
  })(req, res, next);
});

module.exports = router;
