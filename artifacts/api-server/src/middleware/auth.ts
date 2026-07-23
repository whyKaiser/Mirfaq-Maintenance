import { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "يرجى تسجيل الدخول أولاً" });
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "يرجى تسجيل الدخول أولاً" });
    }
    if (!roles.includes(req.session.userRole!)) {
      return res.status(403).json({ error: "ليس لديك صلاحية الوصول لهذه الصفحة" });
    }
    next();
  };
}
