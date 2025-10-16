require('dotenv').config();
const postgres = require('postgres');

const connectionString = `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`;
const sql = postgres(connectionString, { ssl: 'require' });

const COMPREHENSIVE_CATEGORIES = [
  // TOOLS & HARDWARE
  { name: 'Tools & Hardware', parent: null, level: 0 },
  { name: 'Power Tool', parent: 'Tools & Hardware', level: 1 },
  { name: 'Drill & Driver', parent: 'Power Tool', level: 2 },
  { name: 'Cordless Drill', parent: 'Drill & Driver', level: 3 },
  { name: 'Hammer Drill', parent: 'Drill & Driver', level: 3 },
  { name: 'Impact Driver', parent: 'Drill & Driver', level: 3 },
  { name: 'Saw', parent: 'Power Tool', level: 2 },
  { name: 'Circular Saw', parent: 'Saw', level: 3 },
  { name: 'Miter Saw', parent: 'Saw', level: 3 },
  { name: 'Table Saw', parent: 'Saw', level: 3 },
  { name: 'Jigsaw', parent: 'Saw', level: 3 },
  { name: 'Reciprocating Saw', parent: 'Saw', level: 3 },
  { name: 'Concrete Masonry Saw', parent: 'Saw', level: 3 },
  { name: 'Band Saw', parent: 'Saw', level: 3 },
  { name: 'Sander & Polisher', parent: 'Power Tool', level: 2 },
  { name: 'Orbital Sander', parent: 'Sander & Polisher', level: 3 },
  { name: 'Belt Sander', parent: 'Sander & Polisher', level: 3 },
  { name: 'Angle Grinder', parent: 'Power Tool', level: 2 },
  { name: 'Rotary Tool', parent: 'Power Tool', level: 2 },
  { name: 'Nail Gun & Stapler', parent: 'Power Tool', level: 2 },
  { name: 'Hand Tool', parent: 'Tools & Hardware', level: 1 },
  { name: 'Wrench', parent: 'Hand Tool', level: 2 },
  { name: 'Socket Set', parent: 'Hand Tool', level: 2 },
  { name: 'Screwdriver', parent: 'Hand Tool', level: 2 },
  { name: 'Plier', parent: 'Hand Tool', level: 2 },
  { name: 'Hammer', parent: 'Hand Tool', level: 2 },
  { name: 'Measuring Tool', parent: 'Hand Tool', level: 2 },
  { name: 'Hardware', parent: 'Tools & Hardware', level: 1 },
  { name: 'Fastener', parent: 'Hardware', level: 2 },
  { name: 'Hook & Bracket', parent: 'Hardware', level: 2 },
  { name: 'Chain & Rope', parent: 'Hardware', level: 2 },

  // AUTOMOTIVE
  { name: 'Automotive', parent: null, level: 0 },
  { name: 'Car Part', parent: 'Automotive', level: 1 },
  { name: 'Engine Part', parent: 'Car Part', level: 2 },
  { name: 'Filter', parent: 'Engine Part', level: 3 },
  { name: 'Spark Plug', parent: 'Engine Part', level: 3 },
  { name: 'Belt & Hose', parent: 'Engine Part', level: 3 },
  { name: 'Brake & Suspension', parent: 'Car Part', level: 2 },
  { name: 'Brake Pad', parent: 'Brake & Suspension', level: 3 },
  { name: 'Brake Rotor', parent: 'Brake & Suspension', level: 3 },
  { name: 'Shock & Strut', parent: 'Brake & Suspension', level: 3 },
  { name: 'Electrical & Lighting', parent: 'Car Part', level: 2 },
  { name: 'Battery', parent: 'Electrical & Lighting', level: 3 },
  { name: 'Headlight', parent: 'Electrical & Lighting', level: 3 },
  { name: 'Alternator', parent: 'Electrical & Lighting', level: 3 },
  { name: 'Car Accessory', parent: 'Automotive', level: 1 },
  { name: 'Interior Accessory', parent: 'Car Accessory', level: 2 },
  { name: 'Seat Cover', parent: 'Interior Accessory', level: 3 },
  { name: 'Floor Mat', parent: 'Interior Accessory', level: 3 },
  { name: 'Exterior Accessory', parent: 'Car Accessory', level: 2 },
  { name: 'Car Cover', parent: 'Exterior Accessory', level: 3 },
  { name: 'Roof Rack', parent: 'Exterior Accessory', level: 3 },
  { name: 'Tire & Wheel', parent: 'Automotive', level: 1 },
  { name: 'All-Season Tire', parent: 'Tire & Wheel', level: 2 },
  { name: 'Winter Tire', parent: 'Tire & Wheel', level: 2 },
  { name: 'Performance Tire', parent: 'Tire & Wheel', level: 2 },

  // SPORTS & OUTDOORS
  { name: 'Sports & Outdoors', parent: null, level: 0 },
  { name: 'Camping & Hiking', parent: 'Sports & Outdoors', level: 1 },
  { name: 'Tent', parent: 'Camping & Hiking', level: 2 },
  { name: 'Backpacking Tent', parent: 'Tent', level: 3 },
  { name: 'Family Tent', parent: 'Tent', level: 3 },
  { name: 'Sleeping Bag', parent: 'Camping & Hiking', level: 2 },
  { name: 'Backpack', parent: 'Camping & Hiking', level: 2 },
  { name: 'Camping Stove', parent: 'Camping & Hiking', level: 2 },
  { name: 'Cycling', parent: 'Sports & Outdoors', level: 1 },
  { name: 'Bike', parent: 'Cycling', level: 2 },
  { name: 'Mountain Bike', parent: 'Bike', level: 3 },
  { name: 'Road Bike', parent: 'Bike', level: 3 },
  { name: 'Bike Part', parent: 'Cycling', level: 2 },
  { name: 'Helmet', parent: 'Cycling', level: 2 },
  { name: 'Fitness Equipment', parent: 'Sports & Outdoors', level: 1 },
  { name: 'Cardio Equipment', parent: 'Fitness Equipment', level: 2 },
  { name: 'Treadmill', parent: 'Cardio Equipment', level: 3 },
  { name: 'Exercise Bike', parent: 'Cardio Equipment', level: 3 },
  { name: 'Strength Training', parent: 'Fitness Equipment', level: 2 },
  { name: 'Dumbbell', parent: 'Strength Training', level: 3 },
  { name: 'Resistance Band', parent: 'Strength Training', level: 3 },
  { name: 'Water Sport', parent: 'Sports & Outdoors', level: 1 },
  { name: 'Kayak', parent: 'Water Sport', level: 2 },
  { name: 'Paddleboard', parent: 'Water Sport', level: 2 },
  { name: 'Snorkeling & Diving', parent: 'Water Sport', level: 2 },

  // KITCHEN & DINING
  { name: 'Kitchen & Dining', parent: null, level: 0 },
  { name: 'Cookware', parent: 'Kitchen & Dining', level: 1 },
  { name: 'Pot & Pan', parent: 'Cookware', level: 2 },
  { name: 'Frying Pan', parent: 'Pot & Pan', level: 3 },
  { name: 'Sauce Pan', parent: 'Pot & Pan', level: 3 },
  { name: 'Dutch Oven', parent: 'Pot & Pan', level: 3 },
  { name: 'Bakeware', parent: 'Cookware', level: 2 },
  { name: 'Baking Sheet', parent: 'Bakeware', level: 3 },
  { name: 'Cake Pan', parent: 'Bakeware', level: 3 },
  { name: 'Kitchen Appliance', parent: 'Kitchen & Dining', level: 1 },
  { name: 'Small Appliance', parent: 'Kitchen Appliance', level: 2 },
  { name: 'Blender', parent: 'Small Appliance', level: 3 },
  { name: 'Coffee Maker', parent: 'Small Appliance', level: 3 },
  { name: 'Toaster', parent: 'Small Appliance', level: 3 },
  { name: 'Food Processor', parent: 'Small Appliance', level: 3 },
  { name: 'Major Appliance', parent: 'Kitchen Appliance', level: 2 },
  { name: 'Refrigerator', parent: 'Major Appliance', level: 3 },
  { name: 'Dishwasher', parent: 'Major Appliance', level: 3 },
  { name: 'Oven & Range', parent: 'Major Appliance', level: 3 },
  { name: 'Cutlery & Knife', parent: 'Kitchen & Dining', level: 1 },
  { name: 'Chef Knife', parent: 'Cutlery & Knife', level: 2 },
  { name: 'Knife Set', parent: 'Cutlery & Knife', level: 2 },
  { name: 'Dinnerware', parent: 'Kitchen & Dining', level: 1 },
  { name: 'Plate', parent: 'Dinnerware', level: 2 },
  { name: 'Bowl', parent: 'Dinnerware', level: 2 },
  { name: 'Glassware', parent: 'Dinnerware', level: 2 },

  // HOME & GARDEN
  { name: 'Home & Garden', parent: null, level: 0 },
  { name: 'Furniture', parent: 'Home & Garden', level: 1 },
  { name: 'Living Room', parent: 'Furniture', level: 2 },
  { name: 'Sofa', parent: 'Living Room', level: 3 },
  { name: 'Coffee Table', parent: 'Living Room', level: 3 },
  { name: 'TV Stand', parent: 'Living Room', level: 3 },
  { name: 'Bedroom', parent: 'Furniture', level: 2 },
  { name: 'Bed', parent: 'Bedroom', level: 3 },
  { name: 'Dresser', parent: 'Bedroom', level: 3 },
  { name: 'Nightstand', parent: 'Bedroom', level: 3 },
  { name: 'Dining Room', parent: 'Furniture', level: 2 },
  { name: 'Dining Table', parent: 'Dining Room', level: 3 },
  { name: 'Dining Chair', parent: 'Dining Room', level: 3 },
  { name: 'Home Decor', parent: 'Home & Garden', level: 1 },
  { name: 'Wall', parent: 'Home Decor', level: 2 },
  { name: 'Panel', parent: 'Wall', level: 3 },
  { name: 'Curtain', parent: 'Wall', level: 3 },
  { name: 'Drape', parent: 'Wall', level: 3 },
  { name: 'Blind', parent: 'Wall', level: 3 },
  { name: 'Shade', parent: 'Wall', level: 3 },
  { name: 'Wallpaper', parent: 'Wall', level: 3 },
  { name: 'Wall Art', parent: 'Wall', level: 3 },
  { name: 'Wall Mirror', parent: 'Wall', level: 3 },
  { name: 'Wall Shelf', parent: 'Wall', level: 3 },
  { name: 'Tapestry', parent: 'Wall', level: 3 },
  { name: 'Wall Decal', parent: 'Wall', level: 3 },
  { name: 'Wall Clock', parent: 'Wall', level: 3 },
  { name: 'Wall Hook', parent: 'Wall', level: 3 },
  { name: 'Photo Frame', parent: 'Wall', level: 3 },
  { name: 'Canvas Print', parent: 'Wall', level: 3 },
  { name: 'Floor', parent: 'Home Decor', level: 2 },
  { name: 'Rug', parent: 'Floor', level: 3 },
  { name: 'Carpet', parent: 'Floor', level: 3 },
  { name: 'Tile', parent: 'Floor', level: 3 },
  { name: 'Floor Mat', parent: 'Floor', level: 3 },
  { name: 'Runner', parent: 'Floor', level: 3 },
  { name: 'Vinyl Flooring', parent: 'Floor', level: 3 },
  { name: 'Laminate Flooring', parent: 'Floor', level: 3 },
  { name: 'Floor Cushion', parent: 'Floor', level: 3 },
  { name: 'Lighting', parent: 'Home Decor', level: 2 },
  { name: 'Lamp', parent: 'Lighting', level: 3 },
  { name: 'Chandelier', parent: 'Lighting', level: 3 },
  { name: 'Garden & Outdoor', parent: 'Home & Garden', level: 1 },
  { name: 'Lawn Mower', parent: 'Garden & Outdoor', level: 2 },
  { name: 'Garden Tool', parent: 'Garden & Outdoor', level: 2 },
  { name: 'Outdoor Furniture', parent: 'Garden & Outdoor', level: 2 },
  { name: 'Patio Set', parent: 'Outdoor Furniture', level: 3 },
  { name: 'Grill', parent: 'Garden & Outdoor', level: 2 },
  { name: 'Pool & Spa', parent: 'Garden & Outdoor', level: 2 },
  { name: 'Pool Float', parent: 'Pool & Spa', level: 3 },
  { name: 'Pool Accessory', parent: 'Pool & Spa', level: 3 },
  { name: 'Spa Accessory', parent: 'Pool & Spa', level: 3 },

  // BEAUTY & PERSONAL CARE
  { name: 'Beauty & Personal Care', parent: null, level: 0 },
  { name: 'Skincare', parent: 'Beauty & Personal Care', level: 1 },
  { name: 'Moisturizer', parent: 'Skincare', level: 2 },
  { name: 'Face Moisturizer', parent: 'Moisturizer', level: 3 },
  { name: 'Body Lotion', parent: 'Moisturizer', level: 3 },
  { name: 'Cleanser', parent: 'Skincare', level: 2 },
  { name: 'Serum', parent: 'Skincare', level: 2 },
  { name: 'Sunscreen', parent: 'Skincare', level: 2 },
  { name: 'Makeup', parent: 'Beauty & Personal Care', level: 1 },
  { name: 'Face Makeup', parent: 'Makeup', level: 2 },
  { name: 'Foundation', parent: 'Face Makeup', level: 3 },
  { name: 'Concealer', parent: 'Face Makeup', level: 3 },
  { name: 'Eye Makeup', parent: 'Makeup', level: 2 },
  { name: 'Mascara', parent: 'Eye Makeup', level: 3 },
  { name: 'Eyeshadow', parent: 'Eye Makeup', level: 3 },
  { name: 'Lip Makeup', parent: 'Makeup', level: 2 },
  { name: 'Lipstick', parent: 'Lip Makeup', level: 3 },
  { name: 'Lip Gloss', parent: 'Lip Makeup', level: 3 },
  { name: 'Hair Care', parent: 'Beauty & Personal Care', level: 1 },
  { name: 'Shampoo', parent: 'Hair Care', level: 2 },
  { name: 'Conditioner', parent: 'Hair Care', level: 2 },
  { name: 'Styling Product', parent: 'Hair Care', level: 2 },
  { name: 'Hair Tool', parent: 'Hair Care', level: 2 },
  { name: 'Hair Dryer', parent: 'Hair Tool', level: 3 },
  { name: 'Straightener', parent: 'Hair Tool', level: 3 },

  // ELECTRONICS
  { name: 'Electronics', parent: null, level: 0 },
  { name: 'Computer & Tablet', parent: 'Electronics', level: 1 },
  { name: 'Laptop', parent: 'Computer & Tablet', level: 2 },
  { name: 'Desktop', parent: 'Computer & Tablet', level: 2 },
  { name: 'Tablet', parent: 'Computer & Tablet', level: 2 },
  { name: 'Computer Accessory', parent: 'Computer & Tablet', level: 2 },
  { name: 'Keyboard', parent: 'Computer Accessory', level: 3 },
  { name: 'Mouse', parent: 'Computer Accessory', level: 3 },
  { name: 'Monitor', parent: 'Computer Accessory', level: 3 },
  { name: 'TV & Home Theater', parent: 'Electronics', level: 1 },
  { name: 'Television', parent: 'TV & Home Theater', level: 2 },
  { name: 'Soundbar', parent: 'TV & Home Theater', level: 2 },
  { name: 'Streaming Device', parent: 'TV & Home Theater', level: 2 },
  { name: 'Audio', parent: 'Electronics', level: 1 },
  { name: 'Headphone', parent: 'Audio', level: 2 },
  { name: 'Wireless Headphone', parent: 'Headphone', level: 3 },
  { name: 'Earbud', parent: 'Headphone', level: 3 },
  { name: 'Speaker', parent: 'Audio', level: 2 },
  { name: 'Bluetooth Speaker', parent: 'Speaker', level: 3 },
  { name: 'Smart Home', parent: 'Electronics', level: 1 },
  { name: 'Smart Light', parent: 'Smart Home', level: 2 },
  { name: 'Smart Thermostat', parent: 'Smart Home', level: 2 },
  { name: 'Security Camera', parent: 'Smart Home', level: 2 },

  // PET SUPPLIES
  { name: 'Pet Supplies', parent: null, level: 0 },
  { name: 'Dog Supply', parent: 'Pet Supplies', level: 1 },
  { name: 'Dog Food', parent: 'Dog Supply', level: 2 },
  { name: 'Dry Dog Food', parent: 'Dog Food', level: 3 },
  { name: 'Wet Dog Food', parent: 'Dog Food', level: 3 },
  { name: 'Dog Treat', parent: 'Dog Supply', level: 2 },
  { name: 'Dog Toy', parent: 'Dog Supply', level: 2 },
  { name: 'Dog Bed', parent: 'Dog Supply', level: 2 },
  { name: 'Cat Supply', parent: 'Pet Supplies', level: 1 },
  { name: 'Cat Food', parent: 'Cat Supply', level: 2 },
  { name: 'Dry Cat Food', parent: 'Cat Food', level: 3 },
  { name: 'Wet Cat Food', parent: 'Cat Food', level: 3 },
  { name: 'Cat Litter', parent: 'Cat Supply', level: 2 },
  { name: 'Cat Toy', parent: 'Cat Supply', level: 2 },
  { name: 'Fish & Aquatic', parent: 'Pet Supplies', level: 1 },
  { name: 'Aquarium', parent: 'Fish & Aquatic', level: 2 },
  { name: 'Fish Food', parent: 'Fish & Aquatic', level: 2 },

  // TOYS & GAMES
  { name: 'Toys & Games', parent: null, level: 0 },
  { name: 'Action Figure', parent: 'Toys & Games', level: 1 },
  { name: 'Doll', parent: 'Toys & Games', level: 1 },
  { name: 'Building Toy', parent: 'Toys & Games', level: 1 },
  { name: 'LEGO', parent: 'Building Toy', level: 2 },
  { name: 'Board Game', parent: 'Toys & Games', level: 1 },
  { name: 'Family Game', parent: 'Board Game', level: 2 },
  { name: 'Strategy Game', parent: 'Board Game', level: 2 },
  { name: 'Puzzle', parent: 'Toys & Games', level: 1 },
  { name: 'Outdoor Play', parent: 'Toys & Games', level: 1 },
  { name: 'Ride-On Toy', parent: 'Outdoor Play', level: 2 },
  { name: 'Sports Toy', parent: 'Outdoor Play', level: 2 },

  // OFFICE SUPPLIES
  { name: 'Office & School', parent: null, level: 0 },
  { name: 'Office Furniture', parent: 'Office & School', level: 1 },
  { name: 'Desk', parent: 'Office Furniture', level: 2 },
  { name: 'Office Chair', parent: 'Office Furniture', level: 2 },
  { name: 'Filing Cabinet', parent: 'Office Furniture', level: 2 },
  { name: 'Office Supply', parent: 'Office & School', level: 1 },
  { name: 'Pen & Pencil', parent: 'Office Supply', level: 2 },
  { name: 'Notebook', parent: 'Office Supply', level: 2 },
  { name: 'Binder & Folder', parent: 'Office Supply', level: 2 },
  { name: 'Office Electronics', parent: 'Office & School', level: 1 },
  { name: 'Printer', parent: 'Office Electronics', level: 2 },
  { name: 'Scanner', parent: 'Office Electronics', level: 2 },
  { name: 'Shredder', parent: 'Office Electronics', level: 2 },
  { name: 'School Supply', parent: 'Office & School', level: 1 },
  { name: 'School Backpack', parent: 'School Supply', level: 2 },
  { name: 'Lunch Box', parent: 'School Supply', level: 2 },

  // HEALTH & WELLNESS
  { name: 'Health & Wellness', parent: null, level: 0 },
  { name: 'Vitamin & Supplement', parent: 'Health & Wellness', level: 1 },
  { name: 'Multivitamin', parent: 'Vitamin & Supplement', level: 2 },
  { name: 'Protein Supplement', parent: 'Vitamin & Supplement', level: 2 },
  { name: 'Omega-3', parent: 'Vitamin & Supplement', level: 2 },
  { name: 'Medical Supply', parent: 'Health & Wellness', level: 1 },
  { name: 'First Aid', parent: 'Medical Supply', level: 2 },
  { name: 'Blood Pressure Monitor', parent: 'Medical Supply', level: 2 },
  { name: 'Thermometer', parent: 'Medical Supply', level: 2 },
  { name: 'Personal Care', parent: 'Health & Wellness', level: 1 },
  { name: 'Oral Care', parent: 'Personal Care', level: 2 },
  { name: 'Toothbrush', parent: 'Oral Care', level: 3 },
  { name: 'Toothpaste', parent: 'Oral Care', level: 3 },
  { name: 'Bath & Body', parent: 'Personal Care', level: 2 },
  { name: 'Body Wash', parent: 'Bath & Body', level: 3 },
  { name: 'Soap', parent: 'Bath & Body', level: 3 },

  // FASHION (Universal - Gender-Neutral)
  { name: 'Fashion', parent: null, level: 0 },
  { name: 'Clothing', parent: 'Fashion', level: 1 },
  { name: 'Tops', parent: 'Clothing', level: 2 },
  { name: 'Shirt', parent: 'Tops', level: 3 },
  { name: 'T-Shirt', parent: 'Tops', level: 3 },
  { name: 'Sweater', parent: 'Tops', level: 3 },
  { name: 'Hoodie', parent: 'Tops', level: 3 },
  { name: 'Blouse', parent: 'Tops', level: 3 },
  { name: 'Tank Top', parent: 'Tops', level: 3 },
  { name: 'Polo', parent: 'Tops', level: 3 },
  { name: 'Bottoms', parent: 'Clothing', level: 2 },
  { name: 'Jeans', parent: 'Bottoms', level: 3 },
  { name: 'Pants', parent: 'Bottoms', level: 3 },
  { name: 'Shorts', parent: 'Bottoms', level: 3 },
  { name: 'Skirts', parent: 'Bottoms', level: 3 },
  { name: 'Leggings', parent: 'Bottoms', level: 3 },
  { name: 'Dresses & Skirts', parent: 'Clothing', level: 2 },
  { name: 'Dresses', parent: 'Dresses & Skirts', level: 3 },
  { name: 'Maxi Dress', parent: 'Dresses', level: 4 },
  { name: 'Mini Dress', parent: 'Dresses', level: 4 },
  { name: 'Midi Dress', parent: 'Dresses', level: 4 },
  { name: 'Outerwear', parent: 'Clothing', level: 2 },
  { name: 'Jacket', parent: 'Outerwear', level: 3 },
  { name: 'Coat', parent: 'Outerwear', level: 3 },
  { name: 'Blazer', parent: 'Outerwear', level: 3 },
  { name: 'Vest', parent: 'Outerwear', level: 3 },
  { name: 'Footwear', parent: 'Fashion', level: 1 },
  { name: 'Sneakers', parent: 'Footwear', level: 2 },
  { name: 'Boots', parent: 'Footwear', level: 2 },
  { name: 'Loafers', parent: 'Footwear', level: 2 },
  { name: 'Dress Shoes', parent: 'Footwear', level: 2 },
  { name: 'Sandals', parent: 'Footwear', level: 2 },
  { name: 'Heels', parent: 'Footwear', level: 2 },
  { name: 'Flats', parent: 'Footwear', level: 2 },
  { name: 'Slippers', parent: 'Footwear', level: 2 },
  { name: 'Accessories', parent: 'Fashion', level: 1 },
  { name: 'Bags', parent: 'Accessories', level: 2 },
  { name: 'Handbag', parent: 'Bags', level: 3 },
  { name: 'Shoulder Bag', parent: 'Bags', level: 3 },
  { name: 'Crossbody Bag', parent: 'Bags', level: 3 },
  { name: 'Tote Bag', parent: 'Bags', level: 3 },
  { name: 'Backpack', parent: 'Bags', level: 3 },
  { name: 'Clutch', parent: 'Bags', level: 3 },
  { name: 'Wallet', parent: 'Bags', level: 3 },
  { name: 'Jewelry', parent: 'Accessories', level: 2 },
  { name: 'Necklace', parent: 'Jewelry', level: 3 },
  { name: 'Earring', parent: 'Jewelry', level: 3 },
  { name: 'Bracelet', parent: 'Jewelry', level: 3 },
  { name: 'Ring', parent: 'Jewelry', level: 3 },
  { name: 'Watches', parent: 'Accessories', level: 2 },
  { name: 'Belts', parent: 'Accessories', level: 2 },
  { name: 'Scarves', parent: 'Accessories', level: 2 },
  { name: 'Hats', parent: 'Accessories', level: 2 },
  { name: 'Sunglasses', parent: 'Accessories', level: 2 },

  // BABY CARE (Age-Neutral, use tags for baby/toddler/kids)
  { name: 'Baby Care', parent: null, level: 0 },
  { name: 'Baby Gear', parent: 'Baby Care', level: 1 },
  { name: 'Stroller', parent: 'Baby Gear', level: 2 },
  { name: 'Car Seat', parent: 'Baby Gear', level: 2 },
  { name: 'Baby Monitor', parent: 'Baby Gear', level: 2 },
  { name: 'Baby Essentials', parent: 'Baby Care', level: 1 },
  { name: 'Diaper', parent: 'Baby Essentials', level: 2 },
  { name: 'Baby Food', parent: 'Baby Essentials', level: 2 },
  { name: 'Wipe', parent: 'Baby Essentials', level: 2 },
  { name: 'Bottle & Feeding', parent: 'Baby Essentials', level: 2 },

  // BOOKS & MEDIA
  { name: 'Books & Media', parent: null, level: 0 },
  { name: 'Book', parent: 'Books & Media', level: 1 },
  { name: 'Fiction', parent: 'Book', level: 2 },
  { name: 'Non-Fiction', parent: 'Book', level: 2 },
  { name: 'Children\'s Book', parent: 'Book', level: 2 },
  { name: 'Movies & TV', parent: 'Books & Media', level: 1 },
  { name: 'Blu-ray', parent: 'Movies & TV', level: 2 },
  { name: 'DVD', parent: 'Movies & TV', level: 2 },
  { name: 'Music', parent: 'Books & Media', level: 1 },
  { name: 'Vinyl Record', parent: 'Music', level: 2 },
  { name: 'CD', parent: 'Music', level: 2 },

  // GROCERY & FOOD
  { name: 'Grocery & Food', parent: null, level: 0 },
  { name: 'Snack', parent: 'Grocery & Food', level: 1 },
  { name: 'Chip', parent: 'Snack', level: 2 },
  { name: 'Candy', parent: 'Snack', level: 2 },
  { name: 'Nut', parent: 'Snack', level: 2 },
  { name: 'Beverage', parent: 'Grocery & Food', level: 1 },
  { name: 'Coffee & Tea', parent: 'Beverage', level: 2 },
  { name: 'Soft Drink', parent: 'Beverage', level: 2 },
  { name: 'Pantry Staple', parent: 'Grocery & Food', level: 1 },
  { name: 'Pasta', parent: 'Pantry Staple', level: 2 },
  { name: 'Rice', parent: 'Pantry Staple', level: 2 },
  { name: 'Canned Good', parent: 'Pantry Staple', level: 2 },

  // JEWELRY & WATCHES
  { name: 'Jewelry & Watches', parent: null, level: 0 },
  { name: 'Fine Jewelry', parent: 'Jewelry & Watches', level: 1 },
  { name: 'Ring', parent: 'Fine Jewelry', level: 2 },
  { name: 'Necklace', parent: 'Fine Jewelry', level: 2 },
  { name: 'Earring', parent: 'Fine Jewelry', level: 2 },
  { name: 'Fashion Jewelry', parent: 'Jewelry & Watches', level: 1 },
  { name: 'Costume Jewelry', parent: 'Fashion Jewelry', level: 2 },
  { name: 'Watch', parent: 'Jewelry & Watches', level: 1 },
  { name: 'Men\'s Watch', parent: 'Watch', level: 2 },
  { name: 'Women\'s Watch', parent: 'Watch', level: 2 },
  { name: 'Smartwatch', parent: 'Watch', level: 2 },

  // LUGGAGE & TRAVEL
  { name: 'Luggage & Travel', parent: null, level: 0 },
  { name: 'Suitcase', parent: 'Luggage & Travel', level: 1 },
  { name: 'Carry-On Luggage', parent: 'Suitcase', level: 2 },
  { name: 'Checked Luggage', parent: 'Suitcase', level: 2 },
  { name: 'Travel Accessory', parent: 'Luggage & Travel', level: 1 },
  { name: 'Travel Pillow', parent: 'Travel Accessory', level: 2 },
  { name: 'Packing Cube', parent: 'Travel Accessory', level: 2 },
  { name: 'Backpack & Bag', parent: 'Luggage & Travel', level: 1 },
  { name: 'Travel Backpack', parent: 'Backpack & Bag', level: 2 },
  { name: 'Duffel Bag', parent: 'Backpack & Bag', level: 2 },

  // MUSICAL INSTRUMENTS
  { name: 'Musical Instruments', parent: null, level: 0 },
  { name: 'String Instrument', parent: 'Musical Instruments', level: 1 },
  { name: 'Guitar', parent: 'String Instrument', level: 2 },
  { name: 'Electric Guitar', parent: 'Guitar', level: 3 },
  { name: 'Acoustic Guitar', parent: 'Guitar', level: 3 },
  { name: 'Bass Guitar', parent: 'Guitar', level: 3 },
  { name: 'Violin', parent: 'String Instrument', level: 2 },
  { name: 'Keyboard & Piano', parent: 'Musical Instruments', level: 1 },
  { name: 'Digital Piano', parent: 'Keyboard & Piano', level: 2 },
  { name: 'Synthesizer', parent: 'Keyboard & Piano', level: 2 },
  { name: 'Drum & Percussion', parent: 'Musical Instruments', level: 1 },
  { name: 'Drum Set', parent: 'Drum & Percussion', level: 2 },
  { name: 'Electronic Drum', parent: 'Drum & Percussion', level: 2 },

  // CRAFT & HOBBY
  { name: 'Arts & Crafts', parent: null, level: 0 },
  { name: 'Painting Supply', parent: 'Arts & Crafts', level: 1 },
  { name: 'Acrylic Paint', parent: 'Painting Supply', level: 2 },
  { name: 'Oil Paint', parent: 'Painting Supply', level: 2 },
  { name: 'Brush', parent: 'Painting Supply', level: 2 },
  { name: 'Sewing & Fabric', parent: 'Arts & Crafts', level: 1 },
  { name: 'Sewing Machine', parent: 'Sewing & Fabric', level: 2 },
  { name: 'Fabric', parent: 'Sewing & Fabric', level: 2 },
  { name: 'Knitting & Crochet', parent: 'Arts & Crafts', level: 1 },
  { name: 'Yarn', parent: 'Knitting & Crochet', level: 2 },
  { name: 'Knitting Needle', parent: 'Knitting & Crochet', level: 2 },
];

async function seedCategories() {
  try {
    console.log('🚀 Starting comprehensive category seed...\n');

    // Clear existing seed categories (preserve LLM-discovered ones)
    console.log('🗑️  Clearing built-in seed categories (preserving LLM-discovered)...');
    
    // Get count of LLM-discovered categories before cleanup
    const llmCount = await sql`SELECT COUNT(*) FROM categories WHERE llm_discovered = 1`;
    console.log(`   📌 Preserving ${llmCount[0].count} LLM-discovered categories`);
    
    // Only delete product_categories for seed categories (llm_discovered = 0 or NULL)
    await sql`
      DELETE FROM product_categories 
      WHERE category_id IN (
        SELECT category_id FROM categories 
        WHERE llm_discovered = 0 OR llm_discovered IS NULL
      )
    `;
    
    // Only delete seed categories (preserve LLM-discovered)
    await sql`DELETE FROM categories WHERE llm_discovered = 0 OR llm_discovered IS NULL`;
    console.log('✅ Cleared seed categories (LLM-discovered categories preserved)\n');

    // Build parent map tracking full ancestral path for context
    const categoryIdMap = {};
    const levelStack = []; // Track ancestors at each level
    
    // First pass: insert all categories and build ID map
    console.log('📊 Inserting categories...');
    const slugCounter = {};
    
    for (const cat of COMPREHENSIVE_CATEGORIES) {
      // Create base slug
      let slug = cat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      
      // Add counter suffix if duplicate exists
      if (slugCounter[slug] !== undefined) {
        slugCounter[slug]++;
        slug = `${slug}-${slugCounter[slug]}`;
      } else {
        slugCounter[slug] = 0;
      }
      
      // Update level stack to track current ancestry
      levelStack[cat.level] = cat.name;
      // Clear deeper levels when we go back up
      levelStack.length = cat.level + 1;
      
      // Build unique key from full path (e.g., "Fashion:Men:Clothing" vs "Fashion:Women:Clothing")
      const fullPath = levelStack.join(':');
      
      // Get parent ID from the previous level in the stack
      let parentId = null;
      if (cat.level > 0) {
        const parentPath = levelStack.slice(0, cat.level).join(':');
        parentId = categoryIdMap[parentPath] || null;
      }
      
      const result = await sql`
        INSERT INTO categories (name, slug, parent_id, level, llm_discovered)
        VALUES (${cat.name}, ${slug}, ${parentId}, ${cat.level}, 0)
        ON CONFLICT (slug) DO UPDATE SET slug = categories.slug
        RETURNING category_id
      `;
      
      // Store with full path as key so "Fashion:Men:Clothing" and "Fashion:Women:Clothing" are separate
      if (result && result[0]) {
        categoryIdMap[fullPath] = result[0].category_id;
      }
    }

    // Count by department
    const departments = COMPREHENSIVE_CATEGORIES.filter(c => c.level === 0);
    const totalCategories = COMPREHENSIVE_CATEGORIES.length;

    console.log(`\n✅ Seeded ${totalCategories} categories across ${departments.length} departments:`);
    
    for (const dept of departments) {
      const deptCategories = COMPREHENSIVE_CATEGORIES.filter(c => 
        c.parent === dept.name || c.name === dept.name
      );
      console.log(`   - ${dept.name}: ${deptCategories.length} categories`);
    }

    console.log('\n🎉 Category seeding complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding categories:', error);
    process.exit(1);
  }
}

seedCategories();
