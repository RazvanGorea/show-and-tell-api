const { Types } = require("mongoose");
const Busboy = require("busboy");
const { uploadToS3, optimizeImage } = require("../functions/upload");
const { sendCodeEmail, getAccessId, getHistory } = require("../functions/user");
const User = require("../models/User");
const Post = require("../models/Post");

module.exports.getAuthenticatedUserProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select("name email avatar");
    const { name, email, avatar, _id } = user;
    res.status(200).json({ name, email, avatar, _id });
  } catch (error) {
    return next(error);
  }
};

module.exports.getHistory = async (req, res, next) => {
  try {
    const history = await getHistory(req);

    res.status(200).json(history);
  } catch (error) {
    console.log(error);
    return next(error);
  }
};

module.exports.addToHistory = async (req, res, next) => {
  try {
    const isIdValid = Post.exists({ _id: req.body._id });
    if (!isIdValid) {
      return next("Invalid post id");
    }
    const user = await User.findById(req.user._id).select("history");

    const history = [...user.history];
    history.unshift({
      _id: req.body._id,
      date: Date.now(),
      authorId: req.body.authorId,
      id: Types.ObjectId(),
    });

    user.history = history;

    await user.save();

    res.status(201).json({ message: "success" });
  } catch (error) {
    return next(error);
  }
};

module.exports.deleteFromHistory = async (req, res, next) => {
  try {
    if (!req.body.items) {
      await User.findByIdAndUpdate(req.user._id, { history: [] });

      const history = await getHistory(req);

      res.status(200).json(history);
      return;
    }

    const user = await User.findById(req.user._id).select("history");
    const newHistory = [...user.history];

    req.body.items.forEach((id) => {
      newHistory.splice(
        newHistory.findIndex((item) => item.id.toString() === id.toString()),
        1
      );
    });

    user.history = newHistory;

    await user.save();

    const history = await getHistory(req);

    res.status(200).json(history);
  } catch (error) {
    return next(error);
  }
};

module.exports.savePost = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select("saves");

    const saves = [...user.saves];
    saves.unshift({ _id: req.body._id, date: Date.now() });

    user.saves = saves;

    await user.save();

    res.status(201).json({ message: "success" });
  } catch (error) {
    return next(error);
  }
};

module.exports.deleteSavedPost = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select("saves");

    const saves = [...user.saves];
    const existingSave = saves.find((save) => save._id === req.body._id);

    if (!existingSave) {
      return next("Post does not exist");
    }

    saves.splice(saves.indexOf(existingSave), 1);

    user.saves = saves;

    await user.save();

    res.status(201).json({ message: "success" });
  } catch (error) {
    return next(error);
  }
};

module.exports.getSaves = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select("saves").lean();

    const postIdList = [];

    user.saves.forEach((save) => {
      postIdList.unshift(save._id);
    });

    if (postIdList.length === 0) {
      res.status(200).json([]);
      return;
    }

    const authorIds = [];

    const posts = await Post.find()
      .where("_id")
      .in(postIdList)
      .select("title content date authorId thumbnail slug")
      .lean();
    posts.forEach((post) => {
      const data = user.saves.find(
        (item) => item._id.toString() === post._id.toString()
      );
      post.savedDate = data.date;
      authorIds.push(post.authorId);
    });

    const authors = await User.find()
      .where("_id")
      .in(authorIds)
      .select("name avatar")
      .lean();

    posts.forEach((post) => {
      const data = authors.find(
        (author) => `${author._id}` === `${post.authorId}`
      );
      post.author = {
        _id: data._id,
        name: data.name,
        avatar: data.avatar,
      };
    });

    res.status(200).json(posts);
  } catch (error) {
    return next(error);
  }
};

module.exports.sendVerificationCode = async (req, res, next) => {
  try {
    const code = await getAccessId();

    await User.findByIdAndUpdate(req.user._id, {
      resetCode: code,
    });

    await sendCodeEmail(code, req.user.email, "Profile update");

    res.status(200).json({ message: "success" });
  } catch (error) {
    console.log(error);
    return next(error);
  }
};

module.exports.updateProfile = async (req, res, next) => {
  try {
    const busboy = new Busboy({ headers: req.headers });

    const user = await User.findById(req.user._id).select(
      "resetCode email name avatar"
    );

    if (user.resetCode !== req.body.code || user.resetCode === "0") {
      return next("Invalid code");
    }

    busboy.on("finish", async () => {
      user.resetCode = "0";
      user.name = req.body.name;
      if (req.body.email) {
        user.email = req.body.email;
      }
      if (req.files && req.files.avatar) {
        const img = await optimizeImage(req.files.avatar.data, 100, 100);
        const url = await uploadToS3(img, req.files.avatar.name);

        user.avatar = url;
      }

      if (req.body.password) {
        user.password = req.body.password;
      }

      await user.save();

      res.status(200).json({ message: "success" });
    });

    req.pipe(busboy);
  } catch (error) {
    return next(error);
  }
};

module.exports.getUserProfile = async (req, res, next) => {
  try {
    const userId = req.params.uid;
    const user = await User.findById(userId).select("name avatar email").lean();
    const posts = await Post.find({ authorId: userId }).lean();

    res.status(200).json({ ...user, posts });
  } catch (error) {
    return next(error);
  }
};

module.exports.sendResetPasswordCode = async (req, res, next) => {
  try {
    const code = await getAccessId();
    const { email } = req.body;

    await Promise.all([
      User.findOneAndUpdate({ email }, { resetCode: code }),
      sendCodeEmail(code, email, "Password reset"),
    ]);

    res.status(200).json({ message: "success" });
  } catch (error) {
    console.log(error);
    return next(error);
  }
};

module.exports.checkResetPasswordCode = async (req, res, next) => {
  try {
    const { code, email } = req.body;

    const isValid = await User.exists({ resetCode: code, email });

    if (!isValid) {
      res.status(500).json({ message: "invalid" });
      return;
    }

    res.status(200).json({ message: "success" });
  } catch (error) {
    console.log(error);
    return next(error);
  }
};

module.exports.resetPassword = async (req, res, next) => {
  try {
    const { password, code, email } = req.body;

    const user = await User.findOne({ email }).select("password resetCode");

    if (user.resetCode !== code) return next("Incorrect code");

    user.password = password;
    user.resetCode = "0";

    await user.save();

    res.status(200).json({ message: "success" });
  } catch (error) {
    console.log(error);
    return next(error);
  }
};
