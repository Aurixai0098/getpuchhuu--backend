require('dotenv').config({
  path: require('path').join(__dirname, '../../.env')
});

const mongoose = require('mongoose');
const Category = require('../models/Category');
const SubService = require('../models/SubService');
const { categories, services } = require('./data/categoriesServices');

async function importData() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is missing from .env');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected database:', mongoose.connection.name);

  let categoryCount = 0;
  let serviceCount = 0;

  for (const data of categories) {
    const category = await Category.findOneAndUpdate(
      { slug: data.slug },
      { $set: data },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    // Also support existing categories matched by name
    if (category) categoryCount++;
  }

  const categoryDocs = await Category.find({});
  const categoryMap = new Map(
    categoryDocs.map(category => [category.slug, category])
  );

  for (const [categorySlug, serviceList] of Object.entries(services)) {
    const category = categoryMap.get(categorySlug);

    if (!category) {
      console.warn('Category missing, skipped:', categorySlug);
      continue;
    }

    for (const data of serviceList) {
      await SubService.findOneAndUpdate(
        { slug: data.slug },
        { $set: { ...data, category: category._id } },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );

      serviceCount++;
    }
  }

  console.log('Categories processed:', categoryCount);
  console.log('Services processed:', serviceCount);
  console.log('Final category count:', await Category.countDocuments());
  console.log('Final service count:', await SubService.countDocuments());
}

importData()
  .catch(error => {
    console.error('Import failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
