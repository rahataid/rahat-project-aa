// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
// If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
import { lastValueFrom, Observable } from 'rxjs';

interface MicroserviceOptions<TRequest, TResponse> {
  client: Observable<TResponse>;
  onSuccess?: (response: TResponse) => Promise<void | TResponse> | void;
  onError?: (error: any) => Promise<void> | void;
}

export async function handleMicroserviceCall<TRequest, TResponse>(
  options: MicroserviceOptions<TRequest, TResponse>
): Promise<TResponse | void> {
  const { client, onSuccess, onError } = options;

  try {
    // Convert Observable to Promise and wait for the response
    const response = await lastValueFrom(client);
    // If onSuccess callback is pr  ovided, call it with the response
    if (onSuccess) {
      const result = await onSuccess(response);
      if (result) {
        return result;
      }
    }

    return response;
  } catch (error) {
    // If onError callback is provided, call it with the error
    if (onError) {
      await onError(error);
    } else {
      // Rethrow the error if no onError callback is provided
      throw error;
    }
    return error;
  }
}
