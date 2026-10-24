import type { DemoTask } from '@relay-miden/shared';

export const demoTasks: readonly DemoTask[] = [
  {
    id: 'water',
    title: 'Deliver drinking water',
    kind: 'water',
    location: 'Block A, Relief Camp',
    quantity: 20,
    unit: 'Bottles',
    priority: 'high',
    status: 'pending',
    relativeTime: '2 min ago',
    notes: 'Deliver near the main gate. Please coordinate with the camp volunteers.',
  },
  {
    id: 'medical',
    title: 'Medical volunteers needed',
    kind: 'medical',
    location: 'Main Shelter',
    quantity: 5,
    unit: 'Volunteers',
    priority: 'urgent',
    status: 'in-progress',
    relativeTime: '15 min ago',
    notes: 'Volunteers are needed at the first-aid station in the main shelter.',
  },
  {
    id: 'road',
    title: 'Report road blockage',
    kind: 'road',
    location: 'NH 66',
    quantity: 1,
    unit: 'Report',
    priority: 'medium',
    status: 'pending',
    relativeTime: '32 min ago',
    notes: 'Confirm the location of the obstruction before coordinating assistance.',
  },
  {
    id: 'blankets',
    title: 'Distribute blankets',
    kind: 'supplies',
    location: 'Ward 3',
    quantity: 30,
    unit: 'Blankets',
    priority: 'low',
    status: 'completed',
    relativeTime: '1 hr ago',
    notes: 'Blankets for families at the temporary shelter.',
  },
];

// Independent presentation fixtures, not totals calculated from the four sample records.
export const demoMetrics = { active: 8, inProgress: 5, completed: 3 } as const;
