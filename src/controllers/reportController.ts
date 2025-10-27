import { Request, Response } from 'express';
import { supabaseService } from '../services/supabaseService';

export class ReportController {
  // Get campaign summary
  async getSummary(req: Request, res: Response) {
    try {
      const summary = await supabaseService.getCallSummary();
      res.json(summary);
    } catch (error) {
      console.error('Get summary error:', error);
      res.status(500).json({
        error: 'Failed to get summary',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Get all survey responses
  async getAllResponses(req: Request, res: Response) {
    try {
      const responses = await supabaseService.getAllResponses();
      res.json(responses || []);
    } catch (error) {
      console.error('Get responses error:', error);
      res.status(500).json({
        error: 'Failed to get responses',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

export const reportController = new ReportController();

