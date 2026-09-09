import os
import requests
import json
from datetime import datetime
from utils import DMPKey
import urllib.parse
from concurrent.futures import ProcessPoolExecutor, as_completed, ThreadPoolExecutor
import queue
import threading
from tqdm import tqdm
import pandas as pd
# Load configuration from config.json

class Downloader:
    def __init__(self):
        with open(os.path.join(os.path.dirname(__file__), 'config.json'), 'r') as config_file:
            self.config = json.load(config_file)

    def get_latest_files(self, kinds=['AX6']):
        """
        Get the latest files from the DMP

        Args:
            kinds: the kinds of files to get. Check available kinds in the config.json file.

        Returns:
            The list of metadata of the latest files
        """
        dmpkey = DMPKey(self.config['username'], self.config['private_key_path'], self.config['api_endpoint'])
        token = dmpkey.get_access_token_in_one()
        url = f"{self.config['api_endpoint']}/data.getFiles?input="

        query_params = {
            "studyId": self.config['study_id'],
            "fieldIds": [self.config['device_fieldid_mapping'][kind] for kind in kinds if kind in self.config['device_fieldid_mapping']]
        }
        encoded_query_params = urllib.parse.quote(json.dumps(query_params))
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        response = requests.get(url + encoded_query_params, headers=headers)
        response.raise_for_status()

        data = response.json()
        if 'result' in data and 'data' in data['result']:
            return data['result']['data']
        return []

    def download_file(self, file_metadata, save_dir):
        """
            Download a file from the DMP

            Args:
                file_metadata: the file metadata of the file to download
                save_dir: the directory to save the file to

            Returns:
                True if the file is downloaded successfully, False otherwise
        """
        try:
            dmpkey = DMPKey(self.config['username'], self.config['private_key_path'], self.config['api_endpoint'])
            token = dmpkey.get_access_token_in_one()
            file_id = file_metadata.get("fileId") or file_metadata.get("id")
            url = f"{self.config['file_endpoint']}/{file_id}"
            headers = {
                "Authorization": f"Bearer {token}"
            }

            response = requests.get(url, headers=headers, stream=True)
            response.raise_for_status()

            # Generate a meaningful filename based on metadata
            if 'properties' in file_metadata and 'subjectId' in file_metadata['properties'] and 'deviceId' in file_metadata['properties'] and 'startDate' in file_metadata['properties'] and 'endDate' in file_metadata['properties']:
                file_name = f"{file_metadata['properties']['subjectId']}-{file_metadata['properties']['deviceId']}-{file_metadata['properties']['startDate']}-{file_metadata['properties']['endDate']}.{file_metadata['fileName'].split('.')[-1]}"
            else:
                file_name = file_metadata['fileName']

            # Ensure the directory exists
            os.makedirs(save_dir, exist_ok=True)

            # Combine directory and filename
            full_path = os.path.join(save_dir, file_name)

            # Save the file using streaming
            with open(full_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)

            return True
        except Exception as e:
            return False

    def download_clinical_variables(self, save_dir=None):
        """
        Get or download the clinical variables from the DMP.
        If save_dir is provided, the clinical variables will be saved to the directory.

        Args:
            save_dir: the directory to save the clinical variables to

        Returns:
            The clinical variables
        """
        try:
            dmpkey = DMPKey(self.config['username'], self.config['private_key_path'], self.config['api_endpoint'])
            token = dmpkey.get_access_token_in_one()
            url = f"{self.config['api_endpoint']}/data.getStudyFields?input="
            query_params = {
                "studyId": self.config['study_id']
            }
            encoded_query_params = urllib.parse.quote(json.dumps(query_params))
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
            response = requests.get(url + encoded_query_params, headers=headers)
            response.raise_for_status()
            data = response.json()
            if 'result' in data and 'data' in data['result']:
                # Filter out device fields and save to file
                clinical_vars = [f for f in data['result']['data'] if not f.get('fieldId', '').startswith('Device')]
                if save_dir is not None:
                    os.makedirs(save_dir, exist_ok=True)
                    with open(os.path.join(save_dir, 'clinical_variables.ndjson'), 'w') as f:
                        for d in clinical_vars:
                            f.write(json.dumps(d) + '\n')
                return clinical_vars
            return []
        except Exception as e:
            print(f"Error downloading clinical variables: {e}")
            return []

    def download_clinical_data(self, save_dir='./', n_processes=4):
        """
        Download the clinical data from the DMP to an NDJSON file.
        Uses one variable per request and writes directly to file.

        Args:
            save_dir: the directory to save the clinical data to
            n_processes: number of processes to use for parallel downloads

        Returns:
            True if the clinical data is downloaded successfully, False otherwise
        """
        try:
            clinical_variables = self.download_clinical_variables()
            clinical_variables_ids = [f["fieldId"] for f in clinical_variables]

            # Generate token once and share it
            dmpkey = DMPKey(self.config['username'], self.config['private_key_path'], self.config['api_endpoint'])
            shared_token = dmpkey.get_access_token_in_one()

            # Ensure the directory exists
            os.makedirs(save_dir, exist_ok=True)
            clinical_data_file = os.path.join(save_dir, 'clinical_data.ndjson')

            # Single progress bar for processed variables
            pbar = tqdm(total=len(clinical_variables_ids), desc="Processing", unit="vars", ncols=100)

            # Process each variable in parallel
            with ProcessPoolExecutor(max_workers=n_processes) as executor:
                # Submit one job per variable with shared token
                future_to_var = {}
                for i, var_id in enumerate(clinical_variables_ids):
                    task = {
                        'field_id': var_id,
                        'var_index': i,
                        'config': self.config,
                        'token': shared_token  # Pass the shared token
                    }
                    future = executor.submit(download_single_variable, task)
                    future_to_var[future] = var_id

                # Collect results and write immediately
                success_count = 0
                fail_count = 0

                with open(clinical_data_file, 'w') as f:
                    for future in as_completed(future_to_var):
                        var_id = future_to_var[future]
                        try:
                            result = future.result()
                            # Write data immediately if we got any
                            for d in result['data']:
                                f.write(json.dumps(d) + '\n')
                            success_count += 1
                        except Exception as e:
                            fail_count += 1
                            tqdm.write(f"ERROR - Variable {var_id}: {type(e).__name__}: {e}")

                        # Update progress bar
                        pbar.update(1)
                        pbar.set_postfix({"Success": success_count, "Fail": fail_count})

            pbar.close()
            tqdm.write(f"Complete! Processed: {len(clinical_variables_ids)}, Success: {success_count}, Failed: {fail_count}")
            return True

        except Exception as e:
            tqdm.write(f"Error downloading clinical data: {type(e).__name__}: {e}")
            return False

    def _writer_worker(self, write_queue, output_file, total_vars, record_pbar):
        """
        Writer thread that handles all file writing to avoid lock issues
        (Not used in simplified approach)
        """
        pass

def download_single_variable(task):
    """
    Download data for a single clinical variable using shared token
    """
    try:
        config = task['config']
        token = task['token']  # Use shared token instead of generating new one
        url = f"{config['api_endpoint']}/data.getStudyData?input="

        query_params = {
            "studyId": config['study_id'],
            "fieldIds": [task['field_id']]  # Single variable
        }
        encoded_query_params = urllib.parse.quote(json.dumps(query_params))
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        response = requests.get(url + encoded_query_params, headers=headers)
        response.raise_for_status()
        data = response.json()

        if 'result' in data and 'data' in data['result']:
            return {
                'var_index': task['var_index'],
                'data': data['result']['data']
            }
        else:
            # Debug: print response structure when unexpected
            print(f"DEBUG - Variable {task['field_id']} unexpected response: {list(data.keys())}")
            if 'errors' in data:
                print(f"DEBUG - API errors: {data['errors']}")
            return {
                'var_index': task['var_index'],
                'data': []
            }

    except requests.exceptions.HTTPError as e:
        print(f"DEBUG - HTTP error for {task['field_id']}: {e.response.status_code} - {e.response.text[:200]}")
        return {
            'var_index': task['var_index'],
            'data': []
        }
    except Exception as e:
        print(f"DEBUG - Error downloading variable {task['field_id']}: {type(e).__name__}: {e}")
        return {
            'var_index': task['var_index'],
            'data': []
        }


    def download_adam_dataset(self, save_dir='./'):
        """
        Download the ADaM dataset from the DMP to an NDJSON file.

        Please go to the AE to download the files directly with the scripts we provided. As the
        ADaM dataset is based on the dmpy package (a python wrapper for the DMP API), it is not
        straightforward to download the ADaM dataset from the DMP API directly.
        """
        raise NotImplementedError("This function is not implemented yet.")

if __name__ == '__main__':
    """ A general workflow to download all data from the DMP """
    save_path = './data'
    downloader = Downloader()

    # get the latest files
    # files = downloader.get_latest_files(kinds=['AX6'])

    # download the files
    # for file in files:
    #     downloader.download_file(file, save_path)
    #     break


    # # download the clinical variables
    # downloader.download_clinical_variables(save_dir=save_path)

    # download the clinical data
    # downloader.download_clinical_data(save_dir=save_path, n_processes=32)


    # files = downloader.get_latest_files(kinds=[
    # 'ADCL_agg',      'ADDI_agg',
    # 'ADPRO_agg',     'ADSL_agg',
    # 'COG_dst_agg',   'COG_pvt_agg',
    # 'GVA_agg',       'HRV_agg',
    # 'MCR_MCL_agg',   'MCR_MCR_agg',
    # 'SLP_night_agg', 'STS_agg',
    # 'VIT_agg',       'Weather_agg'
    # ])
