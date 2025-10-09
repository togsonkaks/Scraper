require('dotenv').config();
const { autoTag } = require('./scrapers/auto-tagger');
const { saveProduct, getProducts, getProductStats } = require('./server/storage');

const testProduct = {
  url: 'https://www.allbirds.com/products/mens-wool-runners',
  title: "Men's Wool Runners - Allbirds",
  price: '$98.00',
  brand: 'Allbirds',
  description: 'Our original sneaker made from premium merino wool for all-day comfort.',
  breadcrumbs: ['Home', 'Men', 'Shoes', 'Wool Runners'],
  specs: 'Material: Merino Wool, Sole: SweetFoam, Laces: Recycled Polyester',
  tags: 'sustainable, eco-friendly, comfortable',
  images: [
    'https://cdn.allbirds.com/image/wool-runner-1.jpg',
    'https://cdn.allbirds.com/image/wool-runner-2.jpg'
  ]
};

async function testAutoTagging() {
  console.log('🧪 Testing Auto-Tagging System...\n');
  
  console.log('1️⃣ Testing auto-tagger...');
  const tagResults = autoTag(testProduct);
  console.log('✅ Auto-tag results:', JSON.stringify(tagResults, null, 2));
  
  console.log('\n2️⃣ Testing database save...');
  const saveResult = await saveProduct(testProduct, tagResults);
  console.log('✅ Save result:', JSON.stringify(saveResult, null, 2));
  
  console.log('\n3️⃣ Testing product query...');
  const products = await getProducts({ limit: 5 });
  console.log(`✅ Retrieved ${products.length} products`);
  if (products.length > 0) {
    console.log('First product:', JSON.stringify(products[0], null, 2));
  }
  
  console.log('\n4️⃣ Testing product stats...');
  const stats = await getProductStats();
  console.log('✅ Stats:', JSON.stringify(stats, null, 2));
  
  console.log('\n✅ All tests passed!');
  process.exit(0);
}

testAutoTagging().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
