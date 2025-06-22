#!/usr/bin/env python3
"""
Simple test script to verify the Conan API backend works
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from main import app, conan_api, get_all_remotes

def test_basic_functionality():
    """Test basic Conan API functionality"""
    print("🧪 Testing Conan API Backend...")
    
    # Test 1: Check if Conan API is available
    print(f"✅ Conan API available: {bool(conan_api)}")
    
    if not conan_api:
        print("❌ Conan API not available - check Conan installation")
        return False
    
    # Test 2: Check remotes
    try:
        remotes = get_all_remotes()
        print(f"✅ Found {len(remotes)} configured remotes:")
        for remote in remotes:
            print(f"   - {remote.name}: {remote.url}")
    except Exception as e:
        print(f"⚠️  Error getting remotes: {e}")
    
    # Test 3: Test basic listing (this might take a moment)
    try:
        from conan.api.model import ListPattern
        pattern = ListPattern("*", rrev=None, prev=None)
        # Limit to local cache first, don't search remotes
        package_list = conan_api.list.select(pattern, remote=None)
        refs = list(package_list.refs().keys())
        print(f"✅ Found {len(refs)} packages in local cache")
        if refs:
            print(f"   Example: {refs[0]}")
    except Exception as e:
        print(f"⚠️  Error listing packages: {e}")
    
    print("🎉 Basic test completed!")
    return True

if __name__ == "__main__":
    test_basic_functionality()
