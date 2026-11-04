import { Request, Response, NextFunction } from 'express';
import { correctionService } from './correction.service';
import {
  createCorrectionSchema,
  reviewCorrectionSchema,
  queryCorrectionsSchema,
} from './correction.schema';

export class CorrectionController {
  submitCorrection = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = createCorrectionSchema.parse(req.body);
      const correction = await correctionService.submitCorrection(
        req.user!.employeeId,
        input,
        req.user!.userId
      );

      res.status(201).json({
        status: 'success',
        message: 'Correction request submitted for management review',
        data: { correction },
      });
    } catch (error) {
      next(error);
    }
  };

  updateCorrection = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await correctionService.updateCorrection(
        id,
        req.body,
        req.user!.employeeId,
        req.user!.role,
        req.user!.userId
      );
      res.status(200).json({ status: 'success', data: { correction: result } });
    } catch (error) { next(error); }
  };

  deleteCorrection = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await correctionService.deleteCorrection(
        id,
        req.user!.employeeId,
        req.user!.role,
        req.user!.userId
      );
      res.status(200).json({ status: 'success', message: result.message });
    } catch (error) { next(error); }
  };

  reviewCorrection = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const input = reviewCorrectionSchema.parse(req.body);
      const updated = await correctionService.reviewCorrection(
        id,
        input,
        req.user!.userId,
        req.user!.role
      );

      res.status(200).json({
        status: 'success',
        message: `Correction request ${input.status.toLowerCase()} successfully`,
        data: { correction: updated },
      });
    } catch (error) {
      next(error);
    }
  };

  cancelCorrection = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const cancelled = await correctionService.cancelCorrection(
        id,
        req.user!.employeeId,
        req.user!.userId
      );

      res.status(200).json({
        status: 'success',
        message: 'Correction request cancelled',
        data: { correction: cancelled },
      });
    } catch (error) {
      next(error);
    }
  };

  listCorrections = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = queryCorrectionsSchema.parse(req.query);
      const result = await correctionService.listCorrections(
        query,
        req.user!.role,
        req.user!.employeeId
      );

      res.status(200).json({
        status: 'success',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const correctionController = new CorrectionController();