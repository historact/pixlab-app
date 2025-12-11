const multer = require('multer');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const upload = multer(); // memory storage

// Per-IP per-day store for IMG-EDIT (public keys only)
const imgEditRateStore = new Map();
const IMG_EDIT_DAILY_LIMIT = 3;

function imgEditDailyLimit(req, res, next) {
  // Owner keys are unlimited
  if (req.apiKeyType !== 'public') {
    return next();
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket.remoteAddress ||
    'unknown';

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key = `${ip}:${today}`;

  const count = imgEditRateStore.get(key) || 0;

  if (count >= IMG_EDIT_DAILY_LIMIT) {
    return res.status(429).json({
      error: 'daily_limit_reached',
      message: 'You have reached the free daily limit for Image Edit. Please try again tomorrow.',
    });
  }

  imgEditRateStore.set(key, count + 1);
  next();
}

module.exports = function (app, { checkApiKey, imgEditDir, baseUrl }) {
  // POST https://pixlab.davix.dev/v1/img-edit
  // Form-data:
  //   image        [required: file]
  //   format       [optional: jpeg|png|webp|avif...]
  //   width        [optional]
  //   height       [optional]
  //   targetSizeKB [optional]
  //   quality      [optional 1–100]
  app.post(
    '/v1/img-edit',
    checkApiKey,
    imgEditDailyLimit,
    upload.single('image'),
    async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'No image file uploaded' });
        }

        const format = req.body.format; // desired output format (optional)
        const width = req.body.width ? parseInt(req.body.width, 10) : undefined;
        const height = req.body.height ? parseInt(req.body.height, 10) : undefined;
        const targetSizeKB = req.body.targetSizeKB
          ? parseInt(req.body.targetSizeKB, 10)
          : undefined;
        const quality = req.body.quality
          ? parseInt(req.body.quality, 10)
          : undefined;

        const base = sharp(req.file.buffer);
        const originalMeta = await base.metadata(); // original metadata (if you ever want it)

        let pipeline = base;

        // Resize ONLY if width/height are provided
        if (width || height) {
          pipeline = pipeline.resize(
            width || null,
            height || null,
            {
              fit: 'inside',
              withoutEnlargement: true,
            }
          );
        }

        // Decide final format:
        // - If "format" sent → use that
        // - Else keep original metadata.format
        const finalFormat = (format || originalMeta.format || 'jpeg').toLowerCase();

        const applyFormat = (instance, q) => {
          const qOpt = q ? { quality: q } : {};

          switch (finalFormat) {
            case 'png':
              return instance.png({ compressionLevel: 9 });
            case 'webp':
              return instance.webp(qOpt);
            case 'avif':
              return instance.avif(qOpt);
            case 'jpeg':
            case 'jpg':
            default:
              return instance.jpeg(qOpt);
          }
        };

        let outputBuffer;
        let qualityUsed = null;

        // If targetSizeKB is provided → aim for that size via quality binary search
        if (targetSizeKB) {
          const maxBytes = targetSizeKB * 1024;
          let low = 20;
          let high = 90;
          let bestBuffer = null;
          let bestQuality = null;

          for (let i = 0; i < 7; i++) {
            const mid = Math.round((low + high) / 2);

            const testBuffer = await applyFormat(
              pipeline.clone(),
              mid
            ).toBuffer();

            if (testBuffer.length > maxBytes) {
              // too big → lower quality
              high = mid - 5;
            } else {
              // under target → save and try higher quality
              bestBuffer = testBuffer;
              bestQuality = mid;
              low = mid + 5;
            }
          }

          if (bestBuffer) {
            outputBuffer = bestBuffer;
            qualityUsed = bestQuality;
          } else {
            // fallback
            qualityUsed = 70;
            outputBuffer = await applyFormat(pipeline.clone(), qualityUsed).toBuffer();
          }
        } else if (quality || format) {
          // If quality and/or format specified, but no targetSizeKB
          if (quality) qualityUsed = quality;
          outputBuffer = await applyFormat(
            pipeline,
            quality
          ).toBuffer();
        } else {
          // Nothing specified → keep original encoding as much as possible
          outputBuffer = await pipeline.toBuffer();
        }

        // Get final image metadata
        const finalMeta = await sharp(outputBuffer).metadata();

        // File extension based on final format
        const extMap = {
          jpeg: 'jpg',
          jpg: 'jpg',
          png: 'png',
          webp: 'webp',
          avif: 'avif'
        };
        const ext = extMap[finalFormat] || 'jpg';

        const fileName = `${uuidv4()}.${ext}`;
        const filePath = path.join(imgEditDir, fileName);

        // Save file to disk
        await sharp(outputBuffer).toFile(filePath);

        const imageUrl = `${baseUrl}/img-edit/${fileName}`;

        res.json({
          url: imageUrl,
          format: finalFormat,
          sizeBytes: outputBuffer.length,
          width: finalMeta.width || null,
          height: finalMeta.height || null,
          quality: qualityUsed,
          originalName: req.file.originalname || null
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'image_edit_failed', details: String(err) });
      }
    }
  );
};
