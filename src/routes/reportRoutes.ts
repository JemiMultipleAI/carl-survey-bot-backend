import { Router } from 'express';
import { reportController } from '../controllers/reportController';

const router = Router();

// Report routes
router.get('/summary', reportController.getSummary);
router.get('/responses', reportController.getAllResponses);

export { router as reportRoutes };

