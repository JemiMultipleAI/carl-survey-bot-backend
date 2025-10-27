import { Router } from 'express';
import { callController } from '../controllers/callController';
import { customerController } from '../controllers/customerController';
import { reportController } from '../controllers/reportController';
import multer from 'multer';

const router = Router();

// Configure multer for CSV uploads
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

// Customer routes
router.post('/upload', upload.single('csv'), customerController.uploadCustomers);
router.post('/', customerController.createCustomer);
router.get('/', customerController.getCustomers);

// Call routes
router.post('/calls/test', callController.testCall);
router.post('/calls/start', callController.startCall);
router.post('/calls/batch', callController.startBatchCalls);
router.get('/calls/:callId', callController.getCall);
router.get('/calls', callController.getCalls);

// Report routes
router.get('/reports/summary', reportController.getSummary);

export { router as customerRoutes };

