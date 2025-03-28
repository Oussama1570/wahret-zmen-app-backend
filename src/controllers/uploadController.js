// controllers/uploadController.js
const uploadImage = (req, res) => {
    try {
      res.status(200).json({
        message: "Image uploaded successfully",
        image: `/uploads/${req.file.filename}`
      });
    } catch (error) {
      console.error("Image upload failed", error);
      res.status(500).send({ message: "Image upload failed" });
    }
  };
  
  module.exports = { uploadImage };
  