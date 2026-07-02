import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Package from '../models/package.model';
import Gallery from '../models/gallery.model';
import { getPublicId } from '../utils/cloudinary';

// Load environment variables
dotenv.config({ path: '.env' });

// Set mongoose options
mongoose.set('strictQuery', false);

// Define a type for the raw package document with string array gallery
interface RawPackage extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  gallery?: string[];
  [key: string]: any;
}

const migrateGallery = async () => {
  try {
    // Check if DB_CONNECTION is set
    if (!process.env.DB_CONNECTION) {
      throw new Error('DB_CONNECTION is not defined in environment variables');
    }

    console.log('🚀 Starting gallery migration...');
    console.log('Connecting to MongoDB...');
    
    await mongoose.connect(process.env.DB_CONNECTION, {
      serverSelectionTimeoutMS: 10000,
    });
    
    console.log('✅ Connected to MongoDB');

    // Get all packages with gallery images (as string arrays) directly from the database
    const packagesCollection = mongoose.connection.db.collection('packages');
    const rawPackages = await packagesCollection
      .find({ 
        gallery: { 
          $exists: true, 
          $type: 'array',
          $not: { $size: 0 }
        } 
      })
      .toArray() as unknown as RawPackage[];

    console.log(`Found ${rawPackages.length} packages with gallery images to process`);

    if (rawPackages.length === 0) {
      console.log('No packages with gallery images found to migrate.');
      return;
    }

    // Log a sample of what we found
    if (rawPackages.length > 0) {
      console.log('Sample package gallery data:', {
        _id: rawPackages[0]._id,
        name: rawPackages[0].name,
        gallery: rawPackages[0].gallery,
        galleryType: rawPackages[0].gallery ? typeof rawPackages[0].gallery : 'undefined',
        isArray: rawPackages[0].gallery ? Array.isArray(rawPackages[0].gallery) : false
      });
    }

    let totalMigrated = 0;

    // Process each package
    for (const pkg of rawPackages) {
      if (!pkg.gallery || pkg.gallery.length === 0) {
        console.log(`Skipping package ${pkg.name} - no gallery data`);
        continue;
      }
      
      console.log(`\nProcessing package: ${pkg.name} (${pkg._id})`);
      console.log(`Found ${pkg.gallery.length} gallery images`);

      // Create gallery entries for each image URL
      const galleryPromises = [];
      
      for (const imageUrl of pkg.gallery) {
        if (!imageUrl) {
          console.warn('Skipping gallery item - no URL found');
          continue;
        }

        console.log(`Processing image URL: ${imageUrl}`);
        const publicId = getPublicId(imageUrl);
        
        if (!publicId) {
          console.warn(`Could not extract public ID from URL: ${imageUrl}`);
          continue;
        }

        // Use document's _id.getTimestamp() or current date
        const createdAt = pkg._id.getTimestamp ? pkg._id.getTimestamp() : new Date();
        
        console.log(`Creating gallery entry for package ${pkg._id} with publicId: ${publicId}`);
        
        galleryPromises.push(
          new Gallery({
            packageId: pkg._id,
            imageUrl,
            publicId,
            createdAt
          }).save()
        );
      }

      // Wait for all gallery entries to be created
      const results = await Promise.allSettled(galleryPromises);
      
      // Count successful saves
      const successfulSaves = results.filter(result => result.status === 'fulfilled').length;
      totalMigrated += successfulSaves;
      
      console.log(`Created ${successfulSaves} gallery entries for package ${pkg.name}`);
      
      // Log any errors
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(`Error creating gallery entry ${index}:`, result.reason);
        }
      });
      
      // Update the package to use the new gallery references
      if (successfulSaves > 0) {
        const galleryDocs = results
          .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
          .map(result => result.value._id);
          
        await Package.findByIdAndUpdate(pkg._id, { 
          $set: { gallery: galleryDocs }
        });
        console.log(`Updated package ${pkg.name} with new gallery references`);
      }
    }

    console.log('\n✅ Migration complete!');
    console.log(`📦 Total packages processed: ${rawPackages.length}`);
    console.log(`🖼️  Total gallery images migrated: ${totalMigrated}`);

    // Close the connection
    await mongoose.connection.close();
    console.log('\n🔌 MongoDB connection closed');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed!');
    console.error('Error details:', error);
    
    // Try to close the connection if it's open
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('\n🔌 MongoDB connection closed');
    }
    
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
  process.exit(1);
});

// Run the migration
migrateGallery();
