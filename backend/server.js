const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "commit-hacker-backend" });
});

app.use("/api/accounts", require("./routes/accounts"));
app.use("/api/hackers", require("./routes/hackers"));
app.use("/api/hack", require("./routes/hack"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`commit-hacker-backend listening on port ${PORT}`);
});
