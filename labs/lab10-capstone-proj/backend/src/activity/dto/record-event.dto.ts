import { ActivityEventType } from '../activity-event-type.enum';
import { ActivityPayload } from './activity-event.dto';

export interface RecordEventInput {
  userId: string;
  type: ActivityEventType;
  payload: ActivityPayload;
}
