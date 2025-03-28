const Product = require("./product.model");
const translate = require("translate-google");

// ✅ Helper function to translate text to a target language
const translateDetails = async (text, lang) => {
  try {
    return await translate(text, { to: lang });
  } catch (error) {
    console.error(`Translation error (${lang}):`, error);
    return text; // Fallback to original
  }
};

// ✅ Create a New Product with auto translations (title, desc, color names)
const postAProduct = async (req, res) => {
  try {
    let { title, description, category, newPrice, oldPrice, stockQuantity, colors, trending } = req.body;

    if (!Array.isArray(colors) || colors.length === 0) {
      return res.status(400).json({ success: false, message: "At least one color must be provided." });
    }

    const coverImage = colors[0]?.image || "";

    // 🔁 Translate colors
    const translatedColors = await Promise.all(
      colors.map(async (color) => {
        const baseColor = color.colorName;
        return {
          colorName: {
            en: baseColor,
            fr: await translateDetails(baseColor, "fr"),
            ar: await translateDetails(baseColor, "ar"),
          },
          image: color.image,
        };
      })
    );

    // 🌐 Translate title & description
    const translations = {
      en: { title, description },
      fr: {
        title: await translateDetails(title, "fr"),
        description: await translateDetails(description, "fr"),
      },
      ar: {
        title: await translateDetails(title, "ar"),
        description: await translateDetails(description, "ar"),
      },
    };

    const productData = {
      title,
      description,
      translations,
      category,
      coverImage,
      colors: translatedColors,
      oldPrice,
      newPrice,
      finalPrice: newPrice || oldPrice,
      stockQuantity: stockQuantity ? parseInt(stockQuantity, 10) : 10,
      trending,
    };

    const newProduct = new Product(productData);
    await newProduct.save();

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      product: newProduct,
    });
  } catch (error) {
    console.error("❌ Error creating product:", error);
    res.status(500).json({ success: false, message: "Failed to create product" });
  }
};

// ✅ Get All Products
const getAllProducts = async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.status(200).json(products);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ success: false, message: "Failed to fetch products" });
  }
};

// ✅ Get a Single Product by ID
const getSingleProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found!" });
    }

    res.status(200).json(product);
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ success: false, message: "Failed to fetch product" });
  }
};

// ✅ Update Product with auto translations
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    let { title, description, category, newPrice, oldPrice, stockQuantity, colors, trending } = req.body;

    if (!Array.isArray(colors) || colors.length === 0) {
      return res.status(400).json({ success: false, message: "At least one color must be provided." });
    }

    const coverImage = colors[0]?.image || "";

    // Automatic translation into FR and AR
    const translations = {
      en: { title, description },
      fr: {
        title: await translateDetails(title, "fr"),
        description: await translateDetails(description, "fr"),
      },
      ar: {
        title: await translateDetails(title, "ar"),
        description: await translateDetails(description, "ar"),
      },
    };

    const updateData = {
      title,
      description,
      translations,
      category,
      coverImage,
      colors,
      oldPrice,
      newPrice,
      finalPrice: newPrice || oldPrice,
      stockQuantity: stockQuantity ? parseInt(stockQuantity, 10) : 10,
      trending,
    };

    const updatedProduct = await Product.findByIdAndUpdate(id, updateData, { new: true });

    if (!updatedProduct) {
      return res.status(404).json({ success: false, message: "Product not found!" });
    }

    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      product: updatedProduct,
    });
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ success: false, message: "Failed to update product" });
  }
};

// ✅ Delete a Product
const deleteAProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedProduct = await Product.findByIdAndDelete(id);

    if (!deletedProduct) {
      return res.status(404).json({ success: false, message: "Product not found!" });
    }

    res.status(200).json({
      success: true,
      message: "Product deleted successfully",
      product: deletedProduct,
    });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ success: false, message: "Failed to delete product" });
  }
};

// ✅ Update product price by percentage
const updateProductPriceByPercentage = async (req, res) => {
  const { id } = req.params;
  const { percentage } = req.body;

  try {
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found!" });
    }

    const discount = (product.oldPrice * percentage) / 100;
    product.finalPrice = product.oldPrice - discount;

    await product.save();

    res.status(200).json({
      success: true,
      message: "Price updated successfully",
      finalPrice: product.finalPrice,
    });
  } catch (error) {
    console.error("Error updating product price:", error);
    res.status(500).json({ success: false, message: "Failed to update product price" });
  }
};

module.exports = {
  postAProduct,
  getAllProducts,
  getSingleProduct,
  updateProduct,
  deleteAProduct,
  updateProductPriceByPercentage,
};
