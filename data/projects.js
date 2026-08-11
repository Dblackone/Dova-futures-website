/**
 * Project data configuration.
 * To add real images: drop photos into /assets/projects/<project-id>/
 * then update coverImage and gallery paths below.
 *
 * Image slots for future upload:
 *   /assets/projects/<id>/cover.jpg
 *   /assets/projects/<id>/gallery-01.jpg
 *   /assets/projects/<id>/gallery-02.jpg
 *   /assets/projects/<id>/gallery-03.jpg
 */

const PROJECTS = [
  {
    id: 'body-shop-ikeja',
    title: 'The Body Shop Retail Fit-Out',
    category: 'commercial',
    location: 'Ikeja City Mall, Lagos',
    coverImage: '/assets/projects/body-shop.jpg',
    gallery: []
  },
  {
    id: 'palm-oil-drainage',
    title: 'Palm Oil Drainage Infrastructure',
    category: 'infrastructure',
    location: 'Akure, Ondo State',
    coverImage: '/assets/projects/palm-oil-drainage.jpg',
    gallery: []
  },
  {
    id: 'residential-duplex',
    title: 'Residential Duplex Development',
    category: 'residential',
    location: 'Lagos, Nigeria',
    coverImage: '/assets/projects/residential-duplex.jpg',
    gallery: []
  },
  {
    id: 'interior-renovation',
    title: 'Interior Renovation Project',
    category: 'interiors',
    location: 'Ekiti & Lagos States',
    coverImage: '/assets/projects/interior-renovation.jpg',
    gallery: []
  },
  {
    id: 'residential-estate',
    title: 'Residential Estate Build',
    category: 'residential',
    location: 'Port Harcourt',
    coverImage: '/assets/projects/residential-duplex.jpg',
    gallery: []
  },
  {
    id: 'commercial-fitout',
    title: 'Commercial Fit-Out Program',
    category: 'commercial',
    location: 'Lagos Mainland',
    coverImage: '/assets/projects/body-shop.jpg',
    gallery: []
  },
  {
    id: 'drainage-phase-2',
    title: 'Drainage Upgrade Phase II',
    category: 'infrastructure',
    location: 'Southwest Nigeria',
    coverImage: '/assets/projects/palm-oil-drainage.jpg',
    gallery: []
  },
  {
    id: 'premium-office-interiors',
    title: 'Premium Office Interiors',
    category: 'interiors',
    location: 'Victoria Island, Lagos',
    coverImage: '/assets/projects/interior-renovation.jpg',
    gallery: []
  },
  {
    id: 'multi-unit-residential',
    title: 'Multi-Unit Residential Complex',
    category: 'residential',
    location: 'Lekki, Lagos',
    coverImage: '/assets/projects/residential-duplex.jpg',
    gallery: []
  }
];

// Hero / About preview image pool — update when real project photos are added
const HERO_IMAGES = PROJECTS
  .filter(p => p.coverImage)
  .map(p => p.coverImage)
  .filter((v, i, a) => a.indexOf(v) === i);
