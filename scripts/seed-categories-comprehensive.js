require('dotenv').config();
const postgres = require('postgres');

const connectionString = `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`;
const sql = postgres(connectionString);

const COMPREHENSIVE_CATEGORIES = [
  // TOOLS & HARDWARE
  { name: 'Tools & Hardware', parent: null, level: 0 },
  { name: 'Power Tools', parent: 'Tools & Hardware', level: 1 },
  { name: 'Drills & Drivers', parent: 'Power Tools', level: 2 },
  { name: 'Cordless Drills', parent: 'Drills & Drivers', level: 3 },
  { name: 'Hammer Drills', parent: 'Drills & Drivers', level: 3 },
  { name: 'Impact Drivers', parent: 'Drills & Drivers', level: 3 },
  { name: 'Saws', parent: 'Power Tools', level: 2 },
  { name: 'Circular Saws', parent: 'Saws', level: 3 },
  { name: 'Miter Saws', parent: 'Saws', level: 3 },
  { name: 'Table Saws', parent: 'Saws', level: 3 },
  { name: 'Jigsaws', parent: 'Saws', level: 3 },
  { name: 'Reciprocating Saws', parent: 'Saws', level: 3 },
  { name: 'Concrete Masonry Saws', parent: 'Saws', level: 3 },
  { name: 'Band Saws', parent: 'Saws', level: 3 },
  { name: 'Sanders & Polishers', parent: 'Power Tools', level: 2 },
  { name: 'Orbital Sanders', parent: 'Sanders & Polishers', level: 3 },
  { name: 'Belt Sanders', parent: 'Sanders & Polishers', level: 3 },
  { name: 'Angle Grinders', parent: 'Power Tools', level: 2 },
  { name: 'Rotary Tools', parent: 'Power Tools', level: 2 },
  { name: 'Nail Guns & Staplers', parent: 'Power Tools', level: 2 },
  { name: 'Hand Tools', parent: 'Tools & Hardware', level: 1 },
  { name: 'Wrenches', parent: 'Hand Tools', level: 2 },
  { name: 'Socket Sets', parent: 'Hand Tools', level: 2 },
  { name: 'Screwdrivers', parent: 'Hand Tools', level: 2 },
  { name: 'Pliers', parent: 'Hand Tools', level: 2 },
  { name: 'Hammers', parent: 'Hand Tools', level: 2 },
  { name: 'Measuring Tools', parent: 'Hand Tools', level: 2 },
  { name: 'Hardware', parent: 'Tools & Hardware', level: 1 },
  { name: 'Fasteners', parent: 'Hardware', level: 2 },
  { name: 'Hooks & Brackets', parent: 'Hardware', level: 2 },
  { name: 'Chains & Ropes', parent: 'Hardware', level: 2 },

  // AUTOMOTIVE
  { name: 'Automotive', parent: null, level: 0 },
  { name: 'Car Parts', parent: 'Automotive', level: 1 },
  { name: 'Engine Parts', parent: 'Car Parts', level: 2 },
  { name: 'Filters', parent: 'Engine Parts', level: 3 },
  { name: 'Spark Plugs', parent: 'Engine Parts', level: 3 },
  { name: 'Belts & Hoses', parent: 'Engine Parts', level: 3 },
  { name: 'Brakes & Suspension', parent: 'Car Parts', level: 2 },
  { name: 'Brake Pads', parent: 'Brakes & Suspension', level: 3 },
  { name: 'Brake Rotors', parent: 'Brakes & Suspension', level: 3 },
  { name: 'Shocks & Struts', parent: 'Brakes & Suspension', level: 3 },
  { name: 'Electrical & Lighting', parent: 'Car Parts', level: 2 },
  { name: 'Batteries', parent: 'Electrical & Lighting', level: 3 },
  { name: 'Headlights', parent: 'Electrical & Lighting', level: 3 },
  { name: 'Alternators', parent: 'Electrical & Lighting', level: 3 },
  { name: 'Car Accessories', parent: 'Automotive', level: 1 },
  { name: 'Interior Accessories', parent: 'Car Accessories', level: 2 },
  { name: 'Seat Covers', parent: 'Interior Accessories', level: 3 },
  { name: 'Floor Mats', parent: 'Interior Accessories', level: 3 },
  { name: 'Exterior Accessories', parent: 'Car Accessories', level: 2 },
  { name: 'Car Covers', parent: 'Exterior Accessories', level: 3 },
  { name: 'Roof Racks', parent: 'Exterior Accessories', level: 3 },
  { name: 'Tires & Wheels', parent: 'Automotive', level: 1 },
  { name: 'All-Season Tires', parent: 'Tires & Wheels', level: 2 },
  { name: 'Winter Tires', parent: 'Tires & Wheels', level: 2 },
  { name: 'Performance Tires', parent: 'Tires & Wheels', level: 2 },

  // SPORTS & OUTDOORS
  { name: 'Sports & Outdoors', parent: null, level: 0 },
  { name: 'Camping & Hiking', parent: 'Sports & Outdoors', level: 1 },
  { name: 'Tents', parent: 'Camping & Hiking', level: 2 },
  { name: 'Backpacking Tents', parent: 'Tents', level: 3 },
  { name: 'Family Tents', parent: 'Tents', level: 3 },
  { name: 'Sleeping Bags', parent: 'Camping & Hiking', level: 2 },
  { name: 'Backpacks', parent: 'Camping & Hiking', level: 2 },
  { name: 'Camping Stoves', parent: 'Camping & Hiking', level: 2 },
  { name: 'Cycling', parent: 'Sports & Outdoors', level: 1 },
  { name: 'Bikes', parent: 'Cycling', level: 2 },
  { name: 'Mountain Bikes', parent: 'Bikes', level: 3 },
  { name: 'Road Bikes', parent: 'Bikes', level: 3 },
  { name: 'Bike Parts', parent: 'Cycling', level: 2 },
  { name: 'Helmets', parent: 'Cycling', level: 2 },
  { name: 'Fitness Equipment', parent: 'Sports & Outdoors', level: 1 },
  { name: 'Cardio Equipment', parent: 'Fitness Equipment', level: 2 },
  { name: 'Treadmills', parent: 'Cardio Equipment', level: 3 },
  { name: 'Exercise Bikes', parent: 'Cardio Equipment', level: 3 },
  { name: 'Strength Training', parent: 'Fitness Equipment', level: 2 },
  { name: 'Dumbbells', parent: 'Strength Training', level: 3 },
  { name: 'Resistance Bands', parent: 'Strength Training', level: 3 },
  { name: 'Water Sports', parent: 'Sports & Outdoors', level: 1 },
  { name: 'Kayaks', parent: 'Water Sports', level: 2 },
  { name: 'Paddleboards', parent: 'Water Sports', level: 2 },
  { name: 'Snorkeling & Diving', parent: 'Water Sports', level: 2 },

  // KITCHEN & DINING
  { name: 'Kitchen & Dining', parent: null, level: 0 },
  { name: 'Cookware', parent: 'Kitchen & Dining', level: 1 },
  { name: 'Pots & Pans', parent: 'Cookware', level: 2 },
  { name: 'Frying Pans', parent: 'Pots & Pans', level: 3 },
  { name: 'Sauce Pans', parent: 'Pots & Pans', level: 3 },
  { name: 'Dutch Ovens', parent: 'Pots & Pans', level: 3 },
  { name: 'Bakeware', parent: 'Cookware', level: 2 },
  { name: 'Baking Sheets', parent: 'Bakeware', level: 3 },
  { name: 'Cake Pans', parent: 'Bakeware', level: 3 },
  { name: 'Kitchen Appliances', parent: 'Kitchen & Dining', level: 1 },
  { name: 'Small Appliances', parent: 'Kitchen Appliances', level: 2 },
  { name: 'Blenders', parent: 'Small Appliances', level: 3 },
  { name: 'Coffee Makers', parent: 'Small Appliances', level: 3 },
  { name: 'Toasters', parent: 'Small Appliances', level: 3 },
  { name: 'Food Processors', parent: 'Small Appliances', level: 3 },
  { name: 'Major Appliances', parent: 'Kitchen Appliances', level: 2 },
  { name: 'Refrigerators', parent: 'Major Appliances', level: 3 },
  { name: 'Dishwashers', parent: 'Major Appliances', level: 3 },
  { name: 'Ovens & Ranges', parent: 'Major Appliances', level: 3 },
  { name: 'Cutlery & Knives', parent: 'Kitchen & Dining', level: 1 },
  { name: 'Chef Knives', parent: 'Cutlery & Knives', level: 2 },
  { name: 'Knife Sets', parent: 'Cutlery & Knives', level: 2 },
  { name: 'Dinnerware', parent: 'Kitchen & Dining', level: 1 },
  { name: 'Plates', parent: 'Dinnerware', level: 2 },
  { name: 'Bowls', parent: 'Dinnerware', level: 2 },
  { name: 'Glassware', parent: 'Dinnerware', level: 2 },

  // HOME & GARDEN
  { name: 'Home & Garden', parent: null, level: 0 },
  { name: 'Furniture', parent: 'Home & Garden', level: 1 },
  { name: 'Living Room', parent: 'Furniture', level: 2 },
  { name: 'Sofas', parent: 'Living Room', level: 3 },
  { name: 'Coffee Tables', parent: 'Living Room', level: 3 },
  { name: 'TV Stands', parent: 'Living Room', level: 3 },
  { name: 'Bedroom', parent: 'Furniture', level: 2 },
  { name: 'Beds', parent: 'Bedroom', level: 3 },
  { name: 'Dressers', parent: 'Bedroom', level: 3 },
  { name: 'Nightstands', parent: 'Bedroom', level: 3 },
  { name: 'Dining Room', parent: 'Furniture', level: 2 },
  { name: 'Dining Tables', parent: 'Dining Room', level: 3 },
  { name: 'Dining Chairs', parent: 'Dining Room', level: 3 },
  { name: 'Home Decor', parent: 'Home & Garden', level: 1 },
  { name: 'Wall Art', parent: 'Home Decor', level: 2 },
  { name: 'Rugs', parent: 'Home Decor', level: 2 },
  { name: 'Lighting', parent: 'Home Decor', level: 2 },
  { name: 'Lamps', parent: 'Lighting', level: 3 },
  { name: 'Chandeliers', parent: 'Lighting', level: 3 },
  { name: 'Garden & Outdoor', parent: 'Home & Garden', level: 1 },
  { name: 'Lawn Mowers', parent: 'Garden & Outdoor', level: 2 },
  { name: 'Garden Tools', parent: 'Garden & Outdoor', level: 2 },
  { name: 'Outdoor Furniture', parent: 'Garden & Outdoor', level: 2 },
  { name: 'Patio Sets', parent: 'Outdoor Furniture', level: 3 },
  { name: 'Grills', parent: 'Garden & Outdoor', level: 2 },

  // BEAUTY & PERSONAL CARE
  { name: 'Beauty & Personal Care', parent: null, level: 0 },
  { name: 'Skincare', parent: 'Beauty & Personal Care', level: 1 },
  { name: 'Moisturizers', parent: 'Skincare', level: 2 },
  { name: 'Face Moisturizers', parent: 'Moisturizers', level: 3 },
  { name: 'Body Lotions', parent: 'Moisturizers', level: 3 },
  { name: 'Cleansers', parent: 'Skincare', level: 2 },
  { name: 'Serums', parent: 'Skincare', level: 2 },
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
  { name: 'Styling Products', parent: 'Hair Care', level: 2 },
  { name: 'Hair Tools', parent: 'Hair Care', level: 2 },
  { name: 'Hair Dryers', parent: 'Hair Tools', level: 3 },
  { name: 'Straighteners', parent: 'Hair Tools', level: 3 },

  // ELECTRONICS
  { name: 'Electronics', parent: null, level: 0 },
  { name: 'Computers & Tablets', parent: 'Electronics', level: 1 },
  { name: 'Laptops', parent: 'Computers & Tablets', level: 2 },
  { name: 'Desktops', parent: 'Computers & Tablets', level: 2 },
  { name: 'Tablets', parent: 'Computers & Tablets', level: 2 },
  { name: 'Computer Accessories', parent: 'Computers & Tablets', level: 2 },
  { name: 'Keyboards', parent: 'Computer Accessories', level: 3 },
  { name: 'Mice', parent: 'Computer Accessories', level: 3 },
  { name: 'Monitors', parent: 'Computer Accessories', level: 3 },
  { name: 'TV & Home Theater', parent: 'Electronics', level: 1 },
  { name: 'Televisions', parent: 'TV & Home Theater', level: 2 },
  { name: 'Soundbars', parent: 'TV & Home Theater', level: 2 },
  { name: 'Streaming Devices', parent: 'TV & Home Theater', level: 2 },
  { name: 'Audio', parent: 'Electronics', level: 1 },
  { name: 'Headphones', parent: 'Audio', level: 2 },
  { name: 'Wireless Headphones', parent: 'Headphones', level: 3 },
  { name: 'Earbuds', parent: 'Headphones', level: 3 },
  { name: 'Speakers', parent: 'Audio', level: 2 },
  { name: 'Bluetooth Speakers', parent: 'Speakers', level: 3 },
  { name: 'Smart Home', parent: 'Electronics', level: 1 },
  { name: 'Smart Lights', parent: 'Smart Home', level: 2 },
  { name: 'Smart Thermostats', parent: 'Smart Home', level: 2 },
  { name: 'Security Cameras', parent: 'Smart Home', level: 2 },

  // PET SUPPLIES
  { name: 'Pet Supplies', parent: null, level: 0 },
  { name: 'Dog Supplies', parent: 'Pet Supplies', level: 1 },
  { name: 'Dog Food', parent: 'Dog Supplies', level: 2 },
  { name: 'Dry Dog Food', parent: 'Dog Food', level: 3 },
  { name: 'Wet Dog Food', parent: 'Dog Food', level: 3 },
  { name: 'Dog Treats', parent: 'Dog Supplies', level: 2 },
  { name: 'Dog Toys', parent: 'Dog Supplies', level: 2 },
  { name: 'Dog Beds', parent: 'Dog Supplies', level: 2 },
  { name: 'Cat Supplies', parent: 'Pet Supplies', level: 1 },
  { name: 'Cat Food', parent: 'Cat Supplies', level: 2 },
  { name: 'Dry Cat Food', parent: 'Cat Food', level: 3 },
  { name: 'Wet Cat Food', parent: 'Cat Food', level: 3 },
  { name: 'Cat Litter', parent: 'Cat Supplies', level: 2 },
  { name: 'Cat Toys', parent: 'Cat Supplies', level: 2 },
  { name: 'Fish & Aquatic', parent: 'Pet Supplies', level: 1 },
  { name: 'Aquariums', parent: 'Fish & Aquatic', level: 2 },
  { name: 'Fish Food', parent: 'Fish & Aquatic', level: 2 },

  // TOYS & GAMES
  { name: 'Toys & Games', parent: null, level: 0 },
  { name: 'Action Figures', parent: 'Toys & Games', level: 1 },
  { name: 'Dolls', parent: 'Toys & Games', level: 1 },
  { name: 'Building Toys', parent: 'Toys & Games', level: 1 },
  { name: 'LEGO', parent: 'Building Toys', level: 2 },
  { name: 'Board Games', parent: 'Toys & Games', level: 1 },
  { name: 'Family Games', parent: 'Board Games', level: 2 },
  { name: 'Strategy Games', parent: 'Board Games', level: 2 },
  { name: 'Puzzles', parent: 'Toys & Games', level: 1 },
  { name: 'Outdoor Play', parent: 'Toys & Games', level: 1 },
  { name: 'Ride-On Toys', parent: 'Outdoor Play', level: 2 },
  { name: 'Sports Toys', parent: 'Outdoor Play', level: 2 },

  // OFFICE SUPPLIES
  { name: 'Office & School', parent: null, level: 0 },
  { name: 'Office Furniture', parent: 'Office & School', level: 1 },
  { name: 'Desks', parent: 'Office Furniture', level: 2 },
  { name: 'Office Chairs', parent: 'Office Furniture', level: 2 },
  { name: 'Filing Cabinets', parent: 'Office Furniture', level: 2 },
  { name: 'Office Supplies', parent: 'Office & School', level: 1 },
  { name: 'Pens & Pencils', parent: 'Office Supplies', level: 2 },
  { name: 'Notebooks', parent: 'Office Supplies', level: 2 },
  { name: 'Binders & Folders', parent: 'Office Supplies', level: 2 },
  { name: 'Office Electronics', parent: 'Office & School', level: 1 },
  { name: 'Printers', parent: 'Office Electronics', level: 2 },
  { name: 'Scanners', parent: 'Office Electronics', level: 2 },
  { name: 'Shredders', parent: 'Office Electronics', level: 2 },
  { name: 'School Supplies', parent: 'Office & School', level: 1 },
  { name: 'Backpacks', parent: 'School Supplies', level: 2 },
  { name: 'Lunch Boxes', parent: 'School Supplies', level: 2 },

  // HEALTH & WELLNESS
  { name: 'Health & Wellness', parent: null, level: 0 },
  { name: 'Vitamins & Supplements', parent: 'Health & Wellness', level: 1 },
  { name: 'Multivitamins', parent: 'Vitamins & Supplements', level: 2 },
  { name: 'Protein Supplements', parent: 'Vitamins & Supplements', level: 2 },
  { name: 'Omega-3', parent: 'Vitamins & Supplements', level: 2 },
  { name: 'Medical Supplies', parent: 'Health & Wellness', level: 1 },
  { name: 'First Aid', parent: 'Medical Supplies', level: 2 },
  { name: 'Blood Pressure Monitors', parent: 'Medical Supplies', level: 2 },
  { name: 'Thermometers', parent: 'Medical Supplies', level: 2 },
  { name: 'Personal Care', parent: 'Health & Wellness', level: 1 },
  { name: 'Oral Care', parent: 'Personal Care', level: 2 },
  { name: 'Toothbrushes', parent: 'Oral Care', level: 3 },
  { name: 'Toothpaste', parent: 'Oral Care', level: 3 },
  { name: 'Bath & Body', parent: 'Personal Care', level: 2 },
  { name: 'Body Wash', parent: 'Bath & Body', level: 3 },
  { name: 'Soap', parent: 'Bath & Body', level: 3 },

  // FASHION (keep existing but expand)
  { name: 'Fashion', parent: null, level: 0 },
  { name: 'Men', parent: 'Fashion', level: 1 },
  { name: 'Clothing', parent: 'Men', level: 2 },
  { name: 'Shirts', parent: 'Clothing', level: 3 },
  { name: 'Pants', parent: 'Clothing', level: 3 },
  { name: 'Jackets', parent: 'Clothing', level: 3 },
  { name: 'Footwear', parent: 'Men', level: 2 },
  { name: 'Sneakers', parent: 'Footwear', level: 3 },
  { name: 'Boots', parent: 'Footwear', level: 3 },
  { name: 'Dress Shoes', parent: 'Footwear', level: 3 },
  { name: 'Accessories', parent: 'Men', level: 2 },
  { name: 'Watches', parent: 'Accessories', level: 3 },
  { name: 'Belts', parent: 'Accessories', level: 3 },
  { name: 'Women', parent: 'Fashion', level: 1 },
  { name: 'Clothing', parent: 'Women', level: 2 },
  { name: 'Dresses', parent: 'Clothing', level: 3 },
  { name: 'Tops', parent: 'Clothing', level: 3 },
  { name: 'Bottoms', parent: 'Clothing', level: 3 },
  { name: 'Footwear', parent: 'Women', level: 2 },
  { name: 'Heels', parent: 'Footwear', level: 3 },
  { name: 'Flats', parent: 'Footwear', level: 3 },
  { name: 'Sneakers', parent: 'Footwear', level: 3 },
  { name: 'Accessories', parent: 'Women', level: 2 },
  { name: 'Handbags', parent: 'Accessories', level: 3 },
  { name: 'Jewelry', parent: 'Accessories', level: 3 },

  // BABY & KIDS
  { name: 'Baby & Kids', parent: null, level: 0 },
  { name: 'Baby Gear', parent: 'Baby & Kids', level: 1 },
  { name: 'Strollers', parent: 'Baby Gear', level: 2 },
  { name: 'Car Seats', parent: 'Baby Gear', level: 2 },
  { name: 'Baby Monitors', parent: 'Baby Gear', level: 2 },
  { name: 'Baby Care', parent: 'Baby & Kids', level: 1 },
  { name: 'Diapers', parent: 'Baby Care', level: 2 },
  { name: 'Baby Food', parent: 'Baby Care', level: 2 },
  { name: 'Wipes', parent: 'Baby Care', level: 2 },
  { name: 'Kids Clothing', parent: 'Baby & Kids', level: 1 },
  { name: 'Boys Clothing', parent: 'Kids Clothing', level: 2 },
  { name: 'Girls Clothing', parent: 'Kids Clothing', level: 2 },

  // BOOKS & MEDIA
  { name: 'Books & Media', parent: null, level: 0 },
  { name: 'Books', parent: 'Books & Media', level: 1 },
  { name: 'Fiction', parent: 'Books', level: 2 },
  { name: 'Non-Fiction', parent: 'Books', level: 2 },
  { name: 'Children\'s Books', parent: 'Books', level: 2 },
  { name: 'Movies & TV', parent: 'Books & Media', level: 1 },
  { name: 'Blu-ray', parent: 'Movies & TV', level: 2 },
  { name: 'DVD', parent: 'Movies & TV', level: 2 },
  { name: 'Music', parent: 'Books & Media', level: 1 },
  { name: 'Vinyl Records', parent: 'Music', level: 2 },
  { name: 'CDs', parent: 'Music', level: 2 },

  // GROCERY & FOOD
  { name: 'Grocery & Food', parent: null, level: 0 },
  { name: 'Snacks', parent: 'Grocery & Food', level: 1 },
  { name: 'Chips', parent: 'Snacks', level: 2 },
  { name: 'Candy', parent: 'Snacks', level: 2 },
  { name: 'Nuts', parent: 'Snacks', level: 2 },
  { name: 'Beverages', parent: 'Grocery & Food', level: 1 },
  { name: 'Coffee & Tea', parent: 'Beverages', level: 2 },
  { name: 'Soft Drinks', parent: 'Beverages', level: 2 },
  { name: 'Pantry Staples', parent: 'Grocery & Food', level: 1 },
  { name: 'Pasta', parent: 'Pantry Staples', level: 2 },
  { name: 'Rice', parent: 'Pantry Staples', level: 2 },
  { name: 'Canned Goods', parent: 'Pantry Staples', level: 2 },

  // JEWELRY & WATCHES
  { name: 'Jewelry & Watches', parent: null, level: 0 },
  { name: 'Fine Jewelry', parent: 'Jewelry & Watches', level: 1 },
  { name: 'Rings', parent: 'Fine Jewelry', level: 2 },
  { name: 'Necklaces', parent: 'Fine Jewelry', level: 2 },
  { name: 'Earrings', parent: 'Fine Jewelry', level: 2 },
  { name: 'Fashion Jewelry', parent: 'Jewelry & Watches', level: 1 },
  { name: 'Costume Jewelry', parent: 'Fashion Jewelry', level: 2 },
  { name: 'Watches', parent: 'Jewelry & Watches', level: 1 },
  { name: 'Men\'s Watches', parent: 'Watches', level: 2 },
  { name: 'Women\'s Watches', parent: 'Watches', level: 2 },
  { name: 'Smartwatches', parent: 'Watches', level: 2 },

  // LUGGAGE & TRAVEL
  { name: 'Luggage & Travel', parent: null, level: 0 },
  { name: 'Suitcases', parent: 'Luggage & Travel', level: 1 },
  { name: 'Carry-On Luggage', parent: 'Suitcases', level: 2 },
  { name: 'Checked Luggage', parent: 'Suitcases', level: 2 },
  { name: 'Travel Accessories', parent: 'Luggage & Travel', level: 1 },
  { name: 'Travel Pillows', parent: 'Travel Accessories', level: 2 },
  { name: 'Packing Cubes', parent: 'Travel Accessories', level: 2 },
  { name: 'Backpacks & Bags', parent: 'Luggage & Travel', level: 1 },
  { name: 'Travel Backpacks', parent: 'Backpacks & Bags', level: 2 },
  { name: 'Duffel Bags', parent: 'Backpacks & Bags', level: 2 },

  // MUSICAL INSTRUMENTS
  { name: 'Musical Instruments', parent: null, level: 0 },
  { name: 'String Instruments', parent: 'Musical Instruments', level: 1 },
  { name: 'Guitars', parent: 'String Instruments', level: 2 },
  { name: 'Electric Guitars', parent: 'Guitars', level: 3 },
  { name: 'Acoustic Guitars', parent: 'Guitars', level: 3 },
  { name: 'Bass Guitars', parent: 'Guitars', level: 3 },
  { name: 'Violins', parent: 'String Instruments', level: 2 },
  { name: 'Keyboards & Pianos', parent: 'Musical Instruments', level: 1 },
  { name: 'Digital Pianos', parent: 'Keyboards & Pianos', level: 2 },
  { name: 'Synthesizers', parent: 'Keyboards & Pianos', level: 2 },
  { name: 'Drums & Percussion', parent: 'Musical Instruments', level: 1 },
  { name: 'Drum Sets', parent: 'Drums & Percussion', level: 2 },
  { name: 'Electronic Drums', parent: 'Drums & Percussion', level: 2 },

  // CRAFT & HOBBY
  { name: 'Arts & Crafts', parent: null, level: 0 },
  { name: 'Painting Supplies', parent: 'Arts & Crafts', level: 1 },
  { name: 'Acrylic Paints', parent: 'Painting Supplies', level: 2 },
  { name: 'Oil Paints', parent: 'Painting Supplies', level: 2 },
  { name: 'Brushes', parent: 'Painting Supplies', level: 2 },
  { name: 'Sewing & Fabric', parent: 'Arts & Crafts', level: 1 },
  { name: 'Sewing Machines', parent: 'Sewing & Fabric', level: 2 },
  { name: 'Fabric', parent: 'Sewing & Fabric', level: 2 },
  { name: 'Knitting & Crochet', parent: 'Arts & Crafts', level: 1 },
  { name: 'Yarn', parent: 'Knitting & Crochet', level: 2 },
  { name: 'Knitting Needles', parent: 'Knitting & Crochet', level: 2 },
];

async function seedCategories() {
  try {
    console.log('🚀 Starting comprehensive category seed...\n');

    // Clear existing categories
    console.log('🗑️  Clearing existing categories...');
    await sql`DELETE FROM product_categories`;
    await sql`DELETE FROM categories`;
    console.log('✅ Cleared existing categories\n');

    // Build parent map
    const parentMap = {};
    const categoryIdMap = {};
    
    // First pass: insert all categories and build ID map
    console.log('📊 Inserting categories...');
    for (const cat of COMPREHENSIVE_CATEGORIES) {
      const slug = cat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const parentId = cat.parent ? categoryIdMap[cat.parent] : null;
      
      const result = await sql`
        INSERT INTO categories (name, slug, parent_id, level)
        VALUES (${cat.name}, ${slug}, ${parentId}, ${cat.level})
        RETURNING category_id
      `;
      
      categoryIdMap[cat.name] = result[0].category_id;
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
