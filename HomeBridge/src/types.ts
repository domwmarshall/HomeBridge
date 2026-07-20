export type TabKey = 'today' | 'calendar' | 'things' | 'handover' | 'eva';

export type HouseholdLocation =
  | "Dad's house"
  | "Mum's house"
  | 'School'
  | 'School bag'
  | 'Handover bag'
  | 'In transit'
  | 'Missing'
  | 'Outgrown';

export type ItemCategory =
  | 'Uniform'
  | 'Clothing'
  | 'Toy'
  | 'School'
  | 'Medical'
  | 'Other';

export type SyncState = 'local' | 'connecting' | 'synced' | 'offline' | 'error';

export interface HouseholdMember {
  userId: string;
  displayName: string;
  parentLabel?: string;
  role: 'owner' | 'parent' | 'guardian' | 'viewer';
}

export interface Workspace {
  householdId: string;
  householdName: string;
  childId: string;
  userId: string;
  displayName: string;
  parentLabel?: string;
  members: HouseholdMember[];
  createInvite: (parentLabel: string) => Promise<string>;
  refreshWorkspace: () => Promise<void>;
}

export interface ChildProfile {
  id: string;
  name: string;
  initials: string;
  school: string;
  className: string;
  currentHousehold: "Dad's house" | "Mum's house";
  nextHandoverAt: string;
  nextHandoverTo: 'Dad' | 'Mum';
  collectionPlan: string;
  allergies: string[];
  clothingSize: string;
  shoeSize: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt?: string;
  category: 'School' | 'Handover' | 'Party' | 'Trip' | 'Medical' | 'Holiday';
  responsibleParent: 'Dad' | 'Mum' | 'Both';
  location?: string;
  acknowledged: boolean;
  notes?: string;
}

export interface TrackedItem {
  id: string;
  name: string;
  category: ItemCategory;
  quantity: number;
  location: HouseholdLocation;
  neededAt?: HouseholdLocation;
  imageEmoji: string;
  minimumAtDad?: number;
  minimumAtMum?: number;
  notes?: string;
}

export interface HandoverTask {
  id: string;
  label: string;
  itemId?: string;
  done: boolean;
  essential?: boolean;
}

export interface MedicalItem {
  id: string;
  name: string;
  location: HouseholdLocation;
  expiryDate: string;
  quantity: number;
  lastCheckedAt: string;
  replacementStatus: 'OK' | 'Due soon' | 'Requested' | 'Replaced';
}

export interface AppState {
  child: ChildProfile;
  events: CalendarEvent[];
  items: TrackedItem[];
  handoverTasks: HandoverTask[];
  medicalItems: MedicalItem[];
  handoverNote: string;
  activeHandoverId?: string;
}
