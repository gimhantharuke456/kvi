const express = require("express");
const cors = require("cors");
const multer = require("multer");
const OpenAI = require("openai");
const path = require("path");
const fs = require("fs").promises;

const app = express();

function parseOpenAIResponse(responseText) {
  try {
    // First, try direct JSON parsing
    try {
      return JSON.parse(responseText);
    } catch (e) {
      // If direct parsing fails, clean the response

      // Remove markdown code blocks
      let cleaned = responseText.replace(/```json\n?/g, "").replace(/```/g, "");

      // Remove any leading/trailing whitespace
      cleaned = cleaned.trim();

      // Parse the cleaned JSON
      return JSON.parse(cleaned);
    }
  } catch (error) {
    console.error("Error parsing response:", error);
    // If all parsing attempts fail, return a default structure
    return {
      class_name: "unknown",
      confidence_score: 0,
      error: "Failed to parse response",
    };
  }
}

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: "./uploads/",
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({ storage });

// Configure OpenAI
const openai = new OpenAI({
  apiKey:
    "sk-Qe63IVA1OsOGYPm32SBgG59TwPyQFD8nbBI0cUBpOrT3BlbkFJIBUMPAupGqcaXg1eUeuToRydVV7tgD_kPKfXcQXp4A",
});

// Create uploads directory if it doesn't exist
const uploadsDir = "./uploads";
const generatedImagesDir = "./generated_images";

async function ensureDirectoriesExist() {
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.mkdir(generatedImagesDir, { recursive: true });
  } catch (error) {
    console.error("Error creating directories:", error);
  }
}

ensureDirectoriesExist();

// Endpoint for gem shape detection
app.post("/predict", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" });
    }

    // Read the image file
    const imageBuffer = await fs.readFile(req.file.path);
    const base64Image = imageBuffer.toString("base64");

    // Use OpenAI's Vision model to analyze the image
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze this gemstone image and tell me if it's cut or uncut. If this is cur one class shape should be something like pear,heart etc .If it's uncut, also describe its colors. Return the response in JSON format with keys 'class_name' (either name of the shape or 'uncut'), 'confidence_score' (between 0 and 1), and 'color_description' (only if uncut).",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      max_tokens: 150,
    });

    const responseText = response.choices[0].message.content;

    // Parse the response using our helper function
    const analysis = parseOpenAIResponse(responseText);

    // Clean up uploaded file
    await fs.unlink(req.file.path);

    return res.json(analysis);
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// Endpoint for generating gem images
app.post("/generate-image", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const response = await openai.images.generate({
      model: "dall-e-2",
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      response_format: "url",
    });

    const imageUrl = response.data[0].url;

    // Download and save the image
    const imageResponse = await fetch(imageUrl);
    const imageBuffer = await imageResponse.arrayBuffer();

    const timestamp = Date.now();
    const filename = `${timestamp}.png`;
    const filePath = path.join(generatedImagesDir, filename);

    await fs.writeFile(filePath, Buffer.from(imageBuffer));

    return res.json({
      images: [`/images/${filename}`],
      names: [filename],
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// Serve generated images
app.get("/images/:filename", (req, res) => {
  const { filename } = req.params;
  res.sendFile(path.join(__dirname, "generated_images", filename));
});

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ message: "Gem API is running" });
});

const PORT = 8081;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
