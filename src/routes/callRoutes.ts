import { Router } from 'express';
import { callController } from '../controllers/callController';

const router = Router();

// Call routes
router.post('/test', callController.testCall);
router.post('/start', callController.startCall);
router.post('/batch', callController.startBatchCalls);
router.get('/voices', callController.getVoices);
router.post('/text-to-speech', callController.testTextToSpeech);
router.get('/:callId', callController.getCall);
router.get('/', callController.getCalls);

export { router as callRoutes };
