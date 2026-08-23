from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.backends import default_backend
import hashlib
import requests
import json
class DMPKey:
    def __init__(self, username, private_key_path, api_endpoint = 'https://data.ideafast.eu/trpc'):
        self.username = username
        self.private_key_path = private_key_path
        self.api_endpoint = api_endpoint

    def read_private_key(self):
        # Load the private key from the PEM file
        with open(self.private_key_path, "rb") as key_file:
            private_key = serialization.load_pem_private_key(
                key_file.read(),
                password=None,  # If your key is encrypted, replace `None` with the passphrase: `b'your_passphrase'`
                backend=default_backend()
            )
        return private_key

    def read_pem_file(self, pem_file_path):
        with open(pem_file_path, 'r') as pem_file:
            pem_data = pem_file.read()
        return pem_data

    def hash_private_key(self):
        # Read the PEM file content
        pem_data = self.read_pem_file(self.private_key_path)

        # Convert the PEM string to bytes using UTF-8 encoding
        private_key_bytes = pem_data.encode('utf-8')

        # Compute the SHA-256 hash
        sha256_hash = hashlib.sha256(private_key_bytes).hexdigest()

        return sha256_hash

    def get_challenge(self):
        url = self.api_endpoint + '/user.requestAccessToken'

        # Read the PEM file content
        pem_data = self.read_pem_file(self.private_key_path)

        private_hash = self.hash_private_key()

        payload = {
            "username": self.username,
            "hashedPrivateKey": private_hash
        }
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "python/3"
        }
        response = requests.request('POST', url, json=payload, headers=headers, timeout=10)
        return json.loads(response.content.decode('utf-8'))['result']['data']['challenge']

    def sign_challenge(self, challenge):
        # Convert the challenge (hex string) to bytes
        bytes_challenge = bytes.fromhex(challenge)

        # Load the private key
        private_key = self.read_private_key()

        # Sign the hashed challenge with the private key
        signature = private_key.sign(
            bytes_challenge,
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()),
                salt_length=padding.PSS.MAX_LENGTH
            ),
            hashes.SHA256()
        )
        # Return the signature as a hex-encoded string
        return signature.hex()  # Convert the raw bytes signature to a hex string

    def get_access_token(self, signature):
        url = self.api_endpoint + '/user.getAccessToken'
        payload = {
            "username": self.username,
            "hashedPrivateKey": self.hash_private_key(),
            "signature": signature
        }
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "python/3"
        }
        response = requests.request('POST', url, json=payload, headers=headers, timeout=10)
        return json.loads(response.content.decode('utf-8'))['result']['data']

    def get_access_token_in_one(self):
        challenge = self.get_challenge()
        signature = self.sign_challenge(challenge)
        token = self.get_access_token(signature)
        return token

def convert_any_time_to_YYYYMMDD(time_str):
    """
    Convert any time string to YYYYMMDD format.
    Accepts formats: YYYYMMDD, YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY,
    unix timestamps in seconds or milliseconds (as string or number)
    Returns None if format cannot be parsed
    """
    import datetime
    from dateutil import parser

    # If input is null or empty
    if not time_str:
        return None

    # Case 1: Input is already in YYYYMMDD format (8 digits exactly)
    str_value = str(time_str).strip()
    if len(str_value) == 8 and str_value.isdigit():
        return str_value

    # Case 2: Handle unix timestamp (as float/int or string)
    try:
        # Handle scientific notation and floating point timestamps
        if isinstance(time_str, (int, float)) or (isinstance(time_str, str) and
                                                  (str_value.replace('.', '', 1).isdigit() or
                                                   'e' in str_value.lower())):
            # Convert to float first to handle scientific notation
            num_value = float(time_str)

            # If it's milliseconds (large number), convert to seconds
            if num_value > 10000000000:  # Likely milliseconds
                timestamp_seconds = num_value / 1000
            else:
                timestamp_seconds = num_value

            # Use fromtimestamp to convert to date
            try:
                date_obj = datetime.datetime.fromtimestamp(timestamp_seconds)
                return date_obj.strftime('%Y%m%d')
            except (ValueError, OverflowError, OSError) as e:
                print(f"Warning: Timestamp conversion error for {time_str}: {str(e)}")
                return None
    except (ValueError, TypeError) as e:
        # Not a valid numeric timestamp, continue to other formats
        pass

    # Case 3: Try to parse other date formats (YYYY-MM-DD, DD.MM.YYYY, etc.)
    try:
        # Use dateutil parser for various string formats
        parsed_date = parser.parse(str_value, dayfirst=('/' in str_value or '.' in str_value))
        return parsed_date.strftime('%Y%m%d')
    except Exception as e:
        print(f"Warning: Could not parse date format: {time_str}, error: {str(e)}")
        return None
