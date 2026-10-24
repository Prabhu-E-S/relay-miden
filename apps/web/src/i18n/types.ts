import type {
  SupportedLanguage,
  TaskActionCode,
  TaskItemCode,
  TaskUnitCode,
  TaskPriority,
  TaskStatus,
  TaskAction,
} from '@relay-miden/shared';

export type { SupportedLanguage };

export interface TranslationDictionary {
  // Navigation & Branding
  nav: {
    home: string;
    dashboard: string;
    create: string;
    createTask: string;
    send: string;
    receive: string;
    scan: string;
    connections: string;
    tasks: string;
    settings: string;
    greeting: string;
    headline: string;
  };

  // Structured Codes
  actions: Record<TaskActionCode, string>;
  items: Record<TaskItemCode, string>;
  units: Record<TaskUnitCode, string>;
  priorities: Record<TaskPriority, string>;
  statuses: Record<TaskStatus, string>;
  legacyActions: Record<TaskAction, string>;

  // Form & Task Creation
  form: {
    modeStructured: string;
    modeCustom: string;
    modeDescription: string;
    actionLabel: string;
    actionPlaceholder: string;
    itemLabel: string;
    itemPlaceholder: string;
    quantityLabel: string;
    quantityPlaceholder: string;
    unitLabel: string;
    unitPlaceholder: string;
    locationLabel: string;
    locationPlaceholder: string;
    priorityLabel: string;
    statusLabel: string;
    titleLabel: string;
    titlePlaceholder: string;
    notesLabel: string;
    notesPlaceholder: string;
    descriptionLabel: string;
    descriptionPlaceholder: string;
    livePreviewLabel: string;
    livePreviewEmpty: string;
    createTaskButton: string;
    saveChangesButton: string;
    savingButton: string;
    cancelButton: string;
    createdNotice: string;
    savedNotice: string;
    savedNamedNotice: (title: string) => string;
    optionalTag: string;
    untranslatedNoteNotice: string;
  };

  // Task Details & List
  task: {
    detailsTitle: string;
    timelineTitle: string;
    currentStatus: string;
    revision: string;
    noDescription: string;
    reopenButton: string;
    markStatusButton: (statusLabel: string) => string;
    editButton: string;
    deleteButton: string;
    deleteDialogTitle: string;
    deleteDialogDescription: string;
    deleteConfirmButton: string;
    statusUpdatedNotice: (statusLabel: string) => string;
    deletedNotice: string;
    infoTitle: string;
    activityTitle: string;
    taskCreatedActivity: string;
    taskUpdatedActivity: string;
    taskDeletedActivity: string;
    taskImportedActivity: string;
    originPaperBridge: string;
    deviceLabel: string;
    createdLabel: string;
    updatedLabel: string;
    noTasksTitle: string;
    noTasksDescription: string;
    createTaskAction: string;
    recordsCount: (count: number) => string;
    recentHeading: string;
    viewAllLink: string;
    viewQRLink: string;
    filterSearchPlaceholder: string;
    filterAllStatus: string;
    filterActiveStatus: string;
    filterCompletedStatus: string;
    filterAllPriority: string;
  };

  // PaperBridge QR
  paperbridge: {
    sendTitle: string;
    sendDescription: string;
    selectTaskToSend: string;
    generateQRButton: string;
    generatingQR: string;
    qrErrorTitle: string;
    scanInstructions: string;
    downloadQRButton: string;
    copyPayloadButton: string;
    copiedPayloadButton: string;
    regenerateButton: string;
    bytesLabel: (bytes: number) => string;
    receiveTitle: string;
    receiveSubtitle: string;
    useCameraButton: string;
    uploadImageButton: string;
    alignFrameNotice: string;
    cameraNoticeTitle: string;
    cancelCamera: string;
    analyzingImage: string;
    decodedSuccessTitle: string;
    importTaskButton: string;
    importingButton: string;
    importedSuccessTitle: string;
    importedSuccessMessage: (title: string) => string;
    alreadyPresentTitle: string;
    conflictTitle: string;
    viewTaskDetailsButton: string;
    viewExistingButton: string;
    scanAnotherButton: string;
    validationFailedTitle: string;
  };

  // Settings & System
  settings: {
    title: string;
    description: string;
    languageSectionTitle: string;
    languageDescription: (langName: string) => string;
    deviceSectionTitle: string;
    deviceDescription: string;
    offlineIndicatorTitle: string;
    offlineIndicatorDescription: string;
    offlineFooter: string;
  };
}
