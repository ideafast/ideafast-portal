Steps to use this script:

1. Register a public secret key pair. Go to https://data.ideafast.eu -> My Account -> Generate a Key pair -> Register this key pair and save your private key on your local machine securely. The private should be ends with .PEM.

2. Install dependencies and configure:
   - Install all the dependencies: `pip install -r requirements.txt`
   - Go to config.json and change the configurations. You need to change the username and private key path with your own.
   - Check available device kinds in the config.json file under "device_fieldid_mapping"

3. Usage examples:
   - The script provides three main functions:
     * `get_latest_files(kinds)` - Get metadata of the latest files for specified device types
     * `download_file(file_metadata, save_dir)` - Download a single file using streaming for memory efficiency
     * `download_clinical_variables(save_dir)` - Download clinical variables to NDJSON format
     * `download_clinical_data(save_dir)` - Download clinical data to NDJSON format (this may take a while)
   - Run `python download_files.py` to execute the default workflow that downloads device files and clinical data

4. Error handling and performance:
   - The download_file function includes streaming download for large files and basic error handling
   - Network issues or rate limiting may cause errors - implement retry logic as needed
   - Clinical data download processes data in batches of 100 variables to handle API limits
   - Consider adding progress bars for long-running downloads (see comments in the code)

5. File descriptions:
   - `download_files.py` - Main script with Downloader class for accessing DMP API
   - `utils.py` - Utility functions including DMPKey class for authentication
   - `config.json` - Configuration file with API endpoints, study ID, and device mappings
   - `requirements.txt` - Python dependencies needed to run the scripts
   - `clinical_variables.ndjson` - Output file containing clinical variable metadata (one JSON per line)
   - `clinical_data.ndjson` - Output file containing clinical data (one JSON per line, can be very large)
   - Downloaded device files will be saved with meaningful names: `{subjectId}-{deviceId}-{startDate}-{endDate}.{extension}`