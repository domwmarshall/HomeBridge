import { AppState, CalendarEvent } from '../types';
import { dateKey } from '../utils/calendar';

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
    location: 'Primary school',
    acknowledged: true,
    notes: 'Mum collects from the usual gate.',
    allDay: false,
    requiredItemIds: ['school-bag', 'travel-epipen'],
  },
  {
    id: 'summer-break',
    title: 'Norfolk summer holiday begins',
    startsAt: dateOnly(4),
    endsAt: dateOnly(45),
    category: 'Holiday',
    responsibleParent: 'Both',
    acknowledged: true,
    notes: 'Model calendar date — school dates remain editable.',
    allDay: true,
    requiredItemIds: [],
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
    notes: 'Present still needed.',
    allDay: false,
    rsvpDeadline: addDays(2, 12, 0),
    requiredItemIds: ['pink-coat', 'travel-epipen'],
  },
  {
    id: 'trip-beach',
    title: 'Day trip to the beach',
    startsAt: addDays(10, 9, 30),
    endsAt: addDays(10, 17, 0),
    category: 'Trip',
    responsibleParent: 'Mum',
    location: 'Winterton-on-Sea',
    acknowledged: true,
    notes: 'Pack sun cream, hat, water bottle and travel EpiPen.',
    allDay: false,
    requiredItemIds: ['travel-epipen', 'pink-coat'],
  },
  {
    id: 'epipen-check',
    title: 'Check travel EpiPen',
    startsAt: addDays(14, 18, 0),
    category: 'Medical',
    responsibleParent: 'Both',
    acknowledged: false,
    allDay: false,
    requiredItemIds: ['travel-epipen'],
  },
];

const nextTuesday = new Date();
nextTuesday.setHours(12, 0, 0, 0);
const daysToTuesday = (2 - (nextTuesday.getDay() || 7) + 7) % 7;
nextTuesday.setDate(nextTuesday.getDate() + daysToTuesday);

export const demoState: AppState = {
  child: {
    id: 'child-demo',
    name: 'Child',
    initials: 'E',
    school: 'Primary school',
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
      notes: 'Reading record is inside.',
    },
    {
      id: 'pe-kit',
      name: 'PE kit',
      category: 'Uniform',
      quantity: 1,
      location: "Dad's house",
      neededAt: 'School bag',
    },
    {
      id: 'pink-coat',
      name: 'Pink raincoat',
      category: 'Clothing',
      quantity: 1,
      location: "Dad's house",
      neededAt: 'Handover bag',
    },
    {
      id: 'bunny',
      name: 'Bunny teddy',
      category: 'Toy',
      quantity: 1,
      location: "Dad's house",
      neededAt: 'Handover bag',
    },
    {
      id: 'white-polos',
      name: 'White polo shirts',
      category: 'Uniform',
      quantity: 3,
      location: "Dad's house",
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
    },
    {
      id: 'travel-epipen',
      name: 'Travel EpiPen pouch',
      category: 'Medical',
      quantity: 1,
      location: "Dad's house",
      neededAt: 'Handover bag',
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
  careScheduleRules: [
    {
      id: 'rule-demo',
      title: 'Alternating Tuesday handover',
      startsOn: dateKey(nextTuesday),
      householdLabel: "Mum's house",
      pickupParentLabel: 'Mum',
      pickupLocation: 'school or agreed handover point',
      recurrenceRule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU',
    },
  ],
  careOverrides: [],
  handoverNote: '',
};
