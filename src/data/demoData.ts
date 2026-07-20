import { AppState, CalendarEvent } from '../types';

const addDays = (days: number, hour = 15, minute = 15) => {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

const dateOnly = (days: number) => {
  const date = new Date();
  date.setHours(9, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

const events: CalendarEvent[] = [
  {
    id: 'handover-next',
    title: 'School pickup and handover',
    startsAt: addDays(1),
    category: 'Handover',
    responsibleParent: 'Mum',
    location: 'Arden Grove Primary School',
    acknowledged: true,
    notes: 'Mum collects from the usual gate.',
  },
  {
    id: 'summer-break',
    title: 'Norfolk summer holiday begins',
    startsAt: dateOnly(4),
    category: 'Holiday',
    responsibleParent: 'Both',
    acknowledged: true,
    notes: 'Model calendar date — school dates remain editable.',
  },
  {
    id: 'party-amelia',
    title: "Amelia's birthday party",
    startsAt: addDays(6, 13, 30),
    endsAt: addDays(6, 15, 30),
    category: 'Party',
    responsibleParent: 'Dad',
    location: 'Jump Warehouse, Norwich',
    acknowledged: false,
    notes: 'RSVP due in two days. Present still needed.',
  },
  {
    id: 'trip-beach',
    title: 'Day trip to the beach',
    startsAt: addDays(10, 9, 30),
    category: 'Trip',
    responsibleParent: 'Mum',
    location: 'Winterton-on-Sea',
    acknowledged: true,
    notes: 'Pack sun cream, hat, water bottle and travel EpiPen.',
  },
  {
    id: 'epipen-check',
    title: 'Check travel EpiPen',
    startsAt: addDays(14, 18, 0),
    category: 'Medical',
    responsibleParent: 'Both',
    acknowledged: false,
  },
];

export const demoState: AppState = {
  child: {
    id: 'eva-demo',
    name: 'Eva',
    initials: 'E',
    school: 'Arden Grove Primary School',
    className: 'Year 1',
    currentHousehold: "Dad's house",
    nextHandoverAt: addDays(1),
    nextHandoverTo: 'Mum',
    collectionPlan: 'Mum collects from school at 15:15',
    allergies: ['Severe food allergy'],
    clothingSize: '6–7 years',
    shoeSize: 'UK 12',
  },
  events,
  items: [
    {
      id: 'school-bag',
      name: 'School bag',
      category: 'School',
      quantity: 1,
      location: "Dad's house",
      neededAt: 'Handover bag',
      imageEmoji: '🎒',
      notes: 'Reading record is inside.',
    },
    {
      id: 'pe-kit',
      name: 'PE kit',
      category: 'Uniform',
      quantity: 1,
      location: "Dad's house",
      neededAt: 'School bag',
      imageEmoji: '👕',
    },
    {
      id: 'pink-coat',
      name: 'Pink raincoat',
      category: 'Clothing',
      quantity: 1,
      location: "Dad's house",
      neededAt: 'Handover bag',
      imageEmoji: '🧥',
    },
    {
      id: 'bunny',
      name: 'Bunny teddy',
      category: 'Toy',
      quantity: 1,
      location: "Dad's house",
      neededAt: 'Handover bag',
      imageEmoji: '🐰',
    },
    {
      id: 'white-polos',
      name: 'White polo shirts',
      category: 'Uniform',
      quantity: 3,
      location: "Dad's house",
      imageEmoji: '👚',
      minimumAtDad: 2,
      minimumAtMum: 2,
    },
    {
      id: 'reading-book',
      name: 'Reading book',
      category: 'School',
      quantity: 1,
      location: 'School bag',
      neededAt: 'Handover bag',
      imageEmoji: '📘',
    },
    {
      id: 'travel-epipen',
      name: 'Travel EpiPen pouch',
      category: 'Medical',
      quantity: 1,
      location: "Dad's house",
      neededAt: 'Handover bag',
      imageEmoji: '🩺',
    },
  ],
  handoverTasks: [
    { id: 'task-school-bag', label: 'School bag and reading record', itemId: 'school-bag', done: false, essential: true },
    { id: 'task-pe-kit', label: 'PE kit', itemId: 'pe-kit', done: false },
    { id: 'task-coat', label: 'Pink raincoat', itemId: 'pink-coat', done: false },
    { id: 'task-bunny', label: 'Bunny teddy', itemId: 'bunny', done: false },
    { id: 'task-epipen', label: 'Travel EpiPen pouch', itemId: 'travel-epipen', done: false, essential: true },
    { id: 'task-homework', label: 'Pass on school or homework messages', done: false },
  ],
  medicalItems: [
    {
      id: 'epi-dad',
      name: "EpiPen — Dad's house",
      location: "Dad's house",
      expiryDate: addDays(118, 12, 0),
      quantity: 2,
      lastCheckedAt: addDays(-4, 19, 0),
      replacementStatus: 'OK',
    },
    {
      id: 'epi-mum',
      name: "EpiPen — Mum's house",
      location: "Mum's house",
      expiryDate: addDays(42, 12, 0),
      quantity: 2,
      lastCheckedAt: addDays(-9, 19, 0),
      replacementStatus: 'Due soon',
    },
    {
      id: 'epi-travel',
      name: 'Travel EpiPen pouch',
      location: "Dad's house",
      expiryDate: addDays(73, 12, 0),
      quantity: 2,
      lastCheckedAt: addDays(-1, 19, 0),
      replacementStatus: 'OK',
    },
  ],
  handoverNote: '',
};
