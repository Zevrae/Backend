import analysisSchema from "../models/analysisModel.js";
import sendEmail from "../utils/sendEmail.js";
import User from "../models/User.js";

export const getAnalysis = async (req, res) => {
  try {
    const analysis = await analysisSchema.find();
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateAnalysis = async (req, res) => {
  const { productId } = req.body;
  try {
    const analysis = await analysisSchema.findByIdAndUpdate(
      productId,
      { $inc: { demandCounter: 1 } },
      { new: true },
    );
    await sendEmail({
      to: User.email,
      subject: "Apologies for the inconvenience",
      html: `<p>Due to high demand, we are experiencing delays in processing your order for product ${productId}.</p>`,
    });
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
