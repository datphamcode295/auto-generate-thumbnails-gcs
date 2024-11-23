const functions = require('@google-cloud/functions-framework');
const { Storage } = require('@google-cloud/storage');
const gcs = new Storage();
const sharp = require('sharp');
const axios = require('axios'); // Import axios for making HTTP requests
const htmlPdf = require('html-pdf-node');
const mammoth = require('mammoth');

functions.cloudEvent('generateThumbnail', async (cloudEvent) => {
  const event = cloudEvent.data;

  console.log(`Event: ${JSON.stringify(event)}`);
  console.log(`Processing bucket: ${event.bucket}`);

  const fileName = event.name;
  const filenameSplit = fileName.split('.');
  const filenameExt = filenameSplit.pop().toLowerCase();
  const bucketName = event.bucket;


  if (!fileName.includes("_u_thumbnail")) {  
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'tiff', 'tif', 'svg', 'bmp'].includes(filenameExt)) {
      await createImageThumbnail(event, fileName, filenameExt);
    } else if(filenameExt === 'pdf') {
      await createPdfThumbnail(event, fileName);
    } else if(filenameExt === 'docx') {
      await createDocxThumbnail(event, fileName);
    }else {
      console.log(`gs://${bucketName}/${fileName} is not a supported format`);
    }
  } else {
    console.log(`gs://${bucketName}/${fileName} is already a thumbnail`);
  }
});

async function createImageThumbnail(event, fileName, filenameExt) {
  const createdThumbnails = {};
  const filenameSplit = fileName.split('.');
  const filenameWithoutExt = filenameSplit.join('.');
  const bucketName = event.bucket;
  const sizes = ["150x150", "300x300", "600x600", "640x360", "1280x720"];
  const bucket = gcs.bucket(bucketName);
  const gcsObject = bucket.file(fileName);

  try {
    // Download the image
    const [imageBuffer] = await gcsObject.download();

    // Get image metadata
    const metadata = await sharp(imageBuffer).metadata();
    const originalWidth = metadata.width;
    const originalHeight = metadata.height;

    console.log(`Original image dimensions: ${originalWidth}x${originalHeight}`);

    for (const size of sizes) {
      const [targetWidth, targetHeight] = size.split('x').map(Number);

      // Skip thumbnail creation if the original image is smaller than the target size
      if (originalWidth < targetWidth || originalHeight < targetHeight) {
        console.log(`Skipping thumbnail ${size} for ${fileName}: original image is smaller.`);
        continue;
      }

      const newFilename = `${filenameWithoutExt}_${size}_u_thumbnail.${filenameExt}`;
      const gcsNewObject = bucket.file(newFilename);

      // Resize image
      const thumbnailBuffer = await sharp(imageBuffer)
        .resize(targetWidth, targetHeight, { fit: 'inside', withoutEnlargement: true })
        .toBuffer();

      // Upload thumbnail
      await gcsNewObject.save(thumbnailBuffer, {
        metadata: {
          contentType: `image/${filenameExt}`,
          cacheControl: 'public, max-age=3600'
        }
      });

      console.log(`Thumbnail created: ${newFilename}`);

      // Make public
      await gcsNewObject.makePublic();
      console.log(`Thumbnail set to public: gs://${bucketName}/${newFilename}`);

      // Add to created thumbnails object
      createdThumbnails[`s${size}`] = `https://storage.googleapis.com/${bucketName}/${newFilename}`;
    }

    // Prepare the API request body
    const apiRequestBody = {
      name: fileName,
      thumbnails: createdThumbnails
    };

    // TODO: Make the API call back to update the thumbnails to your db
    console.log('API Request:', apiRequestBody);
  } catch (err) {
    console.error(`ERROR processing ${fileName}:`, err);
  }
}

async function createPdfThumbnail(event, fileName) {
  const createdThumbnails = {};
  const filenameSplit = fileName.split('.');
  filenameSplit.pop().toLowerCase();
  const filenameWithoutExt = filenameSplit.join('.');
  const bucketName = event.bucket;
  const sizes = ["150x150", "300x300", "600x600", "640x360", "1280x720"];
  const bucket = gcs.bucket(bucketName);
  const gcsObject = bucket.file(fileName);

  try {
    // Download the image
    const [pdfBuffer] = await gcsObject.download();

    // Save the PDF temporarily        
    const { pdf } = await import("pdf-to-img");
    const document = await pdf(Buffer.from(pdfBuffer), { scale: 3 });

    const imageBuffer = await document.getPage(1);

    // Get image metadata
    const metadata = await sharp(imageBuffer).metadata();
    const originalWidth = metadata.width;
    const originalHeight = metadata.height;

    console.log(`Original image dimensions: ${originalWidth}x${originalHeight}`);

    for (const size of sizes) {
      const [targetWidth, targetHeight] = size.split('x').map(Number);

      // Skip thumbnail creation if the original image is smaller than the target size
      if (originalWidth < targetWidth || originalHeight < targetHeight) {
        console.log(`Skipping thumbnail ${size} for ${fileName}: original image is smaller.`);
        continue;
      }

      const newFilename = `${filenameWithoutExt}_${size}_u_thumbnail.png`;
      const gcsNewObject = bucket.file(newFilename);

      // Resize image
      const thumbnailBuffer = await sharp(imageBuffer)
        .resize(targetWidth, targetHeight, { fit: 'inside', withoutEnlargement: true })
        .toBuffer();

      // Upload thumbnail
      await gcsNewObject.save(thumbnailBuffer, {
        metadata: {
          contentType: `image/png`,
          cacheControl: 'public, max-age=3600'
        }
      });

      console.log(`Thumbnail created: ${newFilename}`);

      // Make public
      await gcsNewObject.makePublic();
      console.log(`Thumbnail set to public: gs://${bucketName}/${newFilename}`);

      // Add to created thumbnails object
      createdThumbnails[`s${size}`] = `https://storage.googleapis.com/${bucketName}/${newFilename}`;
    }

    // Prepare the API request body
    const apiRequestBody = {
      name: fileName,
      thumbnails: createdThumbnails
    };

    /// TODO: Make the API call back to update the thumbnails to your db
    console.log('API Request:', apiRequestBody);
  } catch (err) {
    console.error(`ERROR processing ${fileName}:`, err);
  }
}

async function createDocxThumbnail(event, fileName) {
  const createdThumbnails = {};
  const filenameSplit = fileName.split('.');
  filenameSplit.pop().toLowerCase();
  const filenameWithoutExt = filenameSplit.join('.');
  const bucketName = event.bucket;
  const sizes = ["150x150", "300x300", "600x600", "640x360", "1280x720"];
  const bucket = gcs.bucket(bucketName);
  const gcsObject = bucket.file(fileName);

  try {
    // Download the image
    const [docxBuffer] = await gcsObject.download();
    // Convert DOCX to PDF
    // Convert DOCX to HTML
    const result = await mammoth.convertToHtml({ buffer: docxBuffer });

    // Create HTML content
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body {
              margin: 0;
              padding: 20px;
              width: 794px;
              font-family: Arial, sans-serif;
            }
            img {
              max-width: 100%;
              height: auto;
            }
          </style>
        </head>
        <body>
          ${result.value}
        </body>
      </html>
    `;

    // Convert HTML to PDF
    const options = {
      format: 'A4',
      margin: { top: 20, bottom: 20, left: 20, right: 20 }
    };
    const file = { content: htmlContent };
    const pdfBuffer = await htmlPdf.generatePdf(file, options);

    // Save the PDF temporarily        
    const { pdf } = await import("pdf-to-img");
    const document = await pdf(Buffer.from(pdfBuffer), { scale: 3 });

    const imageBuffer = await document.getPage(1);

    // Get image metadata
    const metadata = await sharp(imageBuffer).metadata();
    const originalWidth = metadata.width;
    const originalHeight = metadata.height;

    console.log(`Original image dimensions: ${originalWidth}x${originalHeight}`);

    for (const size of sizes) {
      const [targetWidth, targetHeight] = size.split('x').map(Number);

      // Skip thumbnail creation if the original image is smaller than the target size
      if (originalWidth < targetWidth || originalHeight < targetHeight) {
        console.log(`Skipping thumbnail ${size} for ${fileName}: original image is smaller.`);
        continue;
      }

      const newFilename = `${filenameWithoutExt}_${size}_u_thumbnail.png`;
      const gcsNewObject = bucket.file(newFilename);

      // Resize image
      const thumbnailBuffer = await sharp(imageBuffer)
        .resize(targetWidth, targetHeight, { fit: 'inside', withoutEnlargement: true })
        .toBuffer();

      // Upload thumbnail
      await gcsNewObject.save(thumbnailBuffer, {
        metadata: {
          contentType: `image/png`,
          cacheControl: 'public, max-age=3600'
        }
      });

      console.log(`Thumbnail created: ${newFilename}`);

      // Make public
      await gcsNewObject.makePublic();
      console.log(`Thumbnail set to public: gs://${bucketName}/${newFilename}`);

      // Add to created thumbnails object
      createdThumbnails[`s${size}`] = `https://storage.googleapis.com/${bucketName}/${newFilename}`;
    }

    // Prepare the API request body
    const apiRequestBody = {
      name: fileName,
      thumbnails: createdThumbnails
    };

    // TODO: Make the API call back to update the thumbnails to your db
    console.log('API Request:', apiRequestBody);
  } catch (err) {
    console.error(`ERROR processing ${fileName}:`, err);
  }
}
