// Sample vendors data - run this once to populate the database
const sampleVendors = [
  {
    name: "ElectroTech Solutions",
    email: "contact@electrotech.com",
    phone: "+1-555-0101",
    address: "123 Electric Ave, Tech City",
    category: "electrical",
    rating: 4.8
  },
  {
    name: "PlumbPro Services",
    email: "info@plumbpro.com", 
    phone: "+1-555-0102",
    address: "456 Water St, Flow Town",
    category: "plumbing",
    rating: 4.6
  },
  {
    name: "BuildRight Construction",
    email: "hello@buildright.com",
    phone: "+1-555-0103", 
    address: "789 Construction Blvd, Build City",
    category: "civil",
    rating: 4.9
  },
  {
    name: "WoodCraft Carpentry",
    email: "orders@woodcraft.com",
    phone: "+1-555-0104",
    address: "321 Wood Lane, Craft Village", 
    category: "carpentry",
    rating: 4.7
  },
  {
    name: "CoolAir HVAC",
    email: "service@coolair.com",
    phone: "+1-555-0105",
    address: "654 Climate Dr, Air City",
    category: "hvac", 
    rating: 4.5
  }
];

// Use this endpoint to create vendors: POST /api/vendors with each vendor object