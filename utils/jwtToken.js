const jwt = require("jsonwebtoken");

const sendToken = (user, statusCode, res) => {
  const token = jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.EXPIRES_TIME || "7d",
    }
  );

  const expiresInDays = parseInt(process.env.EXPIRES_TIME, 10) || 7;
  const expiresDate = new Date(
    Date.now() + expiresInDays * 24 * 60 * 60 * 1000
  );

  const options = {
    expires: expiresDate,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  };

  res
    .status(statusCode)
    .cookie("token", token, options)
    .json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role || "guest",
      },
    });
};

module.exports = sendToken;
