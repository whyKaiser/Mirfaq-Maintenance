export type RequestStatus = 'معلّقة' | 'قيد التنفيذ' | 'مكتملة';
export type RequestPriority = 'عادي' | 'عاجل';
export type ProblemCategory = 'كهرباء' | 'سباكة' | 'تكييف' | 'أخرى';

export interface MaintenanceRequest {
  id: string;
  unit: string;
  category: ProblemCategory;
  description: string;
  technicianName?: string;
  status: RequestStatus;
  priority: RequestPriority;
  date: string;
}

export interface Technician {
  id: string;
  name: string;
  specialty: string;
  activeJobsCount: number;
  status: 'متاح' | 'مشغول';
}

export const mockManagerRequests: MaintenanceRequest[] = [
  {
    id: 'REQ-1045',
    unit: 'فيلا 12',
    category: 'سباكة',
    description: 'تسرب مياه في الحمام الرئيسي',
    technicianName: 'محمد الغامدي',
    status: 'قيد التنفيذ',
    priority: 'عاجل',
    date: '2023-10-14',
  },
  {
    id: 'REQ-1044',
    unit: 'شقة 3B',
    category: 'كهرباء',
    description: 'عطل كهربائي في المطبخ',
    technicianName: 'خالد القحطاني',
    status: 'مكتملة',
    priority: 'عادي',
    date: '2023-10-13',
  },
  {
    id: 'REQ-1043',
    unit: 'شقة 7A',
    category: 'تكييف',
    description: 'تكييف معطل في الصالة',
    technicianName: 'سلطان المطيري',
    status: 'معلّقة',
    priority: 'عاجل',
    date: '2023-10-14',
  },
  {
    id: 'REQ-1042',
    unit: 'استوديو 9',
    category: 'سباكة',
    description: 'صيانة سباكة عامة',
    technicianName: 'عبدالله الدوسري',
    status: 'قيد التنفيذ',
    priority: 'عادي',
    date: '2023-10-13',
  },
  {
    id: 'REQ-1041',
    unit: 'فيلا 5',
    category: 'كهرباء',
    description: 'بلاغ حريق كاذب من الحساس',
    technicianName: 'منير العتيبي',
    status: 'مكتملة',
    priority: 'عاجل',
    date: '2023-10-12',
  },
  {
    id: 'REQ-1040',
    unit: 'شقة 2C',
    category: 'أخرى',
    description: 'أبواب لا تغلق بشكل صحيح',
    technicianName: 'ياسر الشهري',
    status: 'معلّقة',
    priority: 'عادي',
    date: '2023-10-14',
  }
];

export const mockTechnicians: Technician[] = [
  {
    id: 'T-1',
    name: 'محمد الغامدي',
    specialty: 'سباكة',
    activeJobsCount: 2,
    status: 'مشغول'
  },
  {
    id: 'T-2',
    name: 'خالد القحطاني',
    specialty: 'كهرباء',
    activeJobsCount: 0,
    status: 'متاح'
  },
  {
    id: 'T-3',
    name: 'سلطان المطيري',
    specialty: 'تكييف',
    activeJobsCount: 3,
    status: 'مشغول'
  },
  {
    id: 'T-4',
    name: 'عبدالله الدوسري',
    specialty: 'عام',
    activeJobsCount: 1,
    status: 'متاح'
  }
];

export const mockResidentRequests: MaintenanceRequest[] = [
  {
    id: 'REQ-1044',
    unit: 'شقة 3B',
    category: 'كهرباء',
    description: 'عطل كهربائي في غرفة المعيشة',
    technicianName: 'خالد القحطاني',
    status: 'قيد التنفيذ',
    priority: 'عادي',
    date: '2023-10-14',
  },
  {
    id: 'REQ-1030',
    unit: 'شقة 3B',
    category: 'سباكة',
    description: 'تسرب صنبور المطبخ',
    technicianName: 'محمد الغامدي',
    status: 'مكتملة',
    priority: 'عادي',
    date: '2023-10-05',
  },
  {
    id: 'REQ-1048',
    unit: 'شقة 3B',
    category: 'أخرى',
    description: 'أبواب لا تُغلق',
    status: 'معلّقة',
    priority: 'عادي',
    date: '2023-10-15',
  }
];

export const mockTechnicianJobs: MaintenanceRequest[] = [
  {
    id: 'REQ-1045',
    unit: 'فيلا 12',
    category: 'سباكة',
    description: 'تسرب مياه',
    technicianName: 'محمد الغامدي',
    status: 'قيد التنفيذ',
    priority: 'عاجل',
    date: '2023-10-14',
  },
  {
    id: 'REQ-1042',
    unit: 'استوديو 9',
    category: 'سباكة',
    description: 'صيانة سباكة',
    technicianName: 'محمد الغامدي',
    status: 'قيد التنفيذ',
    priority: 'عادي',
    date: '2023-10-13',
  },
  {
    id: 'REQ-1046',
    unit: 'شقة 7A',
    category: 'سباكة',
    description: 'تغيير مواسير',
    technicianName: 'محمد الغامدي',
    status: 'قيد التنفيذ',
    priority: 'عادي',
    date: '2023-10-14',
  }
];

export const mockTechnicianCompletedJobs: MaintenanceRequest[] = [
  {
    id: 'REQ-1035',
    unit: 'فيلا 3',
    category: 'سباكة',
    description: 'إصلاح سخان المياه',
    technicianName: 'محمد الغامدي',
    status: 'مكتملة',
    priority: 'عاجل',
    date: '2023-10-14',
  },
  {
    id: 'REQ-1033',
    unit: 'شقة 4B',
    category: 'سباكة',
    description: 'تسرب من السقف',
    technicianName: 'محمد الغامدي',
    status: 'مكتملة',
    priority: 'عاجل',
    date: '2023-10-14',
  }
];
